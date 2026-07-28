import crypto from 'crypto';
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { ReadingService, ReadingServiceError } from './readingService';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const LEASE_ID_PATTERN = /^[\x20-\x7e]{1,200}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;
const BRIDGE_LEASE_DURATION_MS = 300_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactBody(
  value: unknown,
  allowedKeys: readonly string[],
): JsonRecord {
  if (!isRecord(value)) {
    throw new BridgeRequestError('invalid_body', 'Request body must be an object.');
  }
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unknownKey) {
    throw new BridgeRequestError(
      'unexpected_field',
      `Field "${unknownKey}" is not allowed.`,
    );
  }
  return value;
}

function requireString(
  value: unknown,
  pattern: RegExp,
  code: string,
  message: string,
): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new BridgeRequestError(code, message);
  }
  return value;
}

class BridgeRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeRequestError';
  }
}

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({
    success: false,
    error: message,
    code,
  });
}

function authenticateBridge(
  getConfiguredTokenHash: () => string,
): RequestHandler {
  return (request, response, next) => {
    const configuredHash = getConfiguredTokenHash();
    if (
      typeof configuredHash !== 'string' ||
      !SHA256_HEX_PATTERN.test(configuredHash)
    ) {
      sendError(
        response,
        503,
        'bridge_unavailable',
        'Reading Capture bridge is temporarily unavailable.',
      );
      return;
    }

    const authorization = request.get('Authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      response.set('WWW-Authenticate', 'Bearer');
      sendError(response, 401, 'unauthorized', 'Unauthorized.');
      return;
    }

    const presentedHash = crypto
      .createHash('sha256')
      .update(match[1], 'utf8')
      .digest();
    const expectedHash = Buffer.from(configuredHash, 'hex');
    if (!crypto.timingSafeEqual(presentedHash, expectedHash)) {
      response.set('WWW-Authenticate', 'Bearer');
      sendError(response, 401, 'unauthorized', 'Unauthorized.');
      return;
    }
    next();
  };
}

function requireJson(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.is('application/json')) {
    sendError(
      response,
      415,
      'unsupported_media_type',
      'Content-Type must be application/json.',
    );
    return;
  }
  next();
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

function validateOwnerBody(value: unknown): string {
  const body = requireExactBody(value, ['ownerId']);
  return requireString(
    body.ownerId,
    OWNER_ID_PATTERN,
    'invalid_owner_id',
    'ownerId must contain 1 to 128 safe identifier characters.',
  );
}

function validateLeaseBody(value: unknown): string {
  const body = requireExactBody(value, ['leaseId']);
  return requireString(
    body.leaseId,
    LEASE_ID_PATTERN,
    'invalid_lease_id',
    'leaseId must contain 1 to 200 printable ASCII characters.',
  );
}

function validateFailureBody(value: unknown): {
  leaseId: string;
  errorCode: string;
} {
  const body = requireExactBody(value, ['leaseId', 'errorCode']);
  return {
    leaseId: requireString(
      body.leaseId,
      LEASE_ID_PATTERN,
      'invalid_lease_id',
      'leaseId must contain 1 to 200 printable ASCII characters.',
    ),
    errorCode: requireString(
      body.errorCode,
      ERROR_CODE_PATTERN,
      'invalid_error_code',
      'errorCode must contain 1 to 64 uppercase identifier characters.',
    ),
  };
}

function validateCaptureId(value: string): string {
  return requireString(
    value,
    CAPTURE_ID_PATTERN,
    'invalid_capture_id',
    'captureId is invalid.',
  );
}

function sendBridgeError(error: unknown, response: Response): void {
  if (error instanceof BridgeRequestError) {
    sendError(response, 400, error.code, error.message);
    return;
  }
  if (error instanceof ReadingServiceError) {
    const statuses: Partial<Record<ReadingServiceError['code'], number>> = {
      capture_not_found: 404,
      capture_state_conflict: 409,
      capture_lease_conflict: 409,
      capture_lease_expired: 409,
      capture_lease_not_expired: 409,
      invalid_capture_transition: 409,
      invalid_delivery_metadata: 400,
    };
    sendError(
      response,
      statuses[error.code] ?? 400,
      error.code,
      error.message,
    );
    return;
  }

  const parserError = error as { status?: number; type?: string };
  if (parserError?.type === 'entity.too.large' || parserError?.status === 413) {
    sendError(response, 413, 'request_too_large', 'Request body is too large.');
    return;
  }
  if (error instanceof SyntaxError && parserError?.status === 400) {
    sendError(response, 400, 'invalid_json', 'Request body must contain valid JSON.');
    return;
  }

  console.error('Reading Capture bridge request failed safely.');
  sendError(
    response,
    503,
    'bridge_unavailable',
    'Reading Capture bridge is temporarily unavailable.',
  );
}

export function createReadingBridgeRouter(
  service: ReadingService,
  getConfiguredTokenHash: () => string,
): express.Router {
  const router = express.Router();
  const jsonParser = express.json({ limit: '16kb', strict: true });

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticateBridge(getConfiguredTokenHash));
  router.use((request, response, next) => {
    if (request.method !== 'POST') {
      response.set('Allow', 'POST');
      sendError(
        response,
        405,
        'method_not_allowed',
        'Only documented bridge POST operations are supported.',
      );
      return;
    }
    next();
  });
  router.use((request, _response, next) => {
    if (Object.keys(request.query).length > 0) {
      next(new BridgeRequestError(
        'unexpected_query_parameter',
        'Query parameters are not allowed.',
      ));
      return;
    }
    next();
  });
  router.use(requireJson);
  router.use(jsonParser);

  router.post('/claim', asyncRoute(async (request, response) => {
    const ownerId = validateOwnerBody(request.body);
    const capture = await service.claimNextCapture(
      ownerId,
      BRIDGE_LEASE_DURATION_MS,
    );
    if (!capture) {
      response.json({ success: true, data: null });
      return;
    }
    const lease = capture.deliveryLease;
    if (!lease) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'The claimed capture has no delivery lease.',
      );
    }
    response.json({
      success: true,
      data: {
        captureId: capture.id,
        destinationNotePath: capture.destinationNotePath,
        markdown: service.formatCapture(capture),
        leaseId: lease.leaseId,
        leaseExpiresAt: lease.expiresAt,
      },
    });
  }));

  router.post('/recover-expired', asyncRoute(async (request, response) => {
    const ownerId = validateOwnerBody(request.body);
    const recoveredCount = await service.recoverExpiredCaptures(ownerId);
    response.json({
      success: true,
      data: { recoveredCount },
    });
  }));

  router.post('/:captureId/confirm', asyncRoute(async (request, response) => {
    const captureId = validateCaptureId(request.params.captureId);
    const leaseId = validateLeaseBody(request.body);
    const capture = await service.confirmDelivery(captureId, leaseId);
    response.json({
      success: true,
      data: {
        captureId: capture.id,
        status: capture.status,
        deliveredAt: capture.deliveredAt,
      },
    });
  }));

  router.post('/:captureId/failure', asyncRoute(async (request, response) => {
    const captureId = validateCaptureId(request.params.captureId);
    const { leaseId, errorCode } = validateFailureBody(request.body);
    const capture = await service.reportDeliveryFailure(
      captureId,
      leaseId,
      errorCode,
    );
    response.json({
      success: true,
      data: {
        captureId: capture.id,
        status: capture.status,
        errorCode: capture.deliveryAttempts.lastErrorCode,
      },
    });
  }));

  router.all('*', (_request, response) => {
    response.set('Allow', 'POST');
    sendError(
      response,
      405,
      'method_not_allowed',
      'Only documented bridge POST operations are supported.',
    );
  });

  router.use((
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    sendBridgeError(error, response);
  });

  return router;
}
