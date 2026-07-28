import crypto from 'crypto';
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { ReadingService, ReadingServiceError } from './readingService';
import { ReadingValidationError } from './readingValidation';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export function isReadingCaptureApiTokenHashValid(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value);
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

function authenticateReadingCaptureAction(
  getConfiguredTokenHash: () => string,
): RequestHandler {
  return (request, response, next) => {
    const configuredHash = getConfiguredTokenHash();
    if (!isReadingCaptureApiTokenHashValid(configuredHash)) {
      sendError(
        response,
        503,
        'api_unavailable',
        'Reading Capture is temporarily unavailable.',
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

function requireJsonContentType(
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

function sendReadingActionError(error: unknown, response: Response): void {
  if (error instanceof ReadingValidationError) {
    sendError(response, 400, error.code, error.message);
    return;
  }
  if (error instanceof ReadingServiceError) {
    const statuses: Partial<Record<ReadingServiceError['code'], number>> = {
      book_not_found: 404,
      book_ambiguous: 409,
      book_inactive: 409,
      book_revision_conflict: 409,
      idempotency_conflict: 409,
    };
    sendError(response, statuses[error.code] ?? 400, error.code, error.message);
    return;
  }

  const parserError = error as {
    status?: number;
    type?: string;
  };
  if (parserError?.type === 'entity.too.large' || parserError?.status === 413) {
    sendError(response, 413, 'request_too_large', 'Request body is too large.');
    return;
  }
  if (error instanceof SyntaxError && parserError?.status === 400) {
    sendError(response, 400, 'invalid_json', 'Request body must contain valid JSON.');
    return;
  }

  console.error('Reading Capture action failed safely.');
  sendError(
    response,
    503,
    'api_unavailable',
    'Reading Capture is temporarily unavailable.',
  );
}

export function createReadingActionRouter(
  service: ReadingService,
  getConfiguredTokenHash: () => string,
): express.Router {
  const router = express.Router();
  const jsonParser = express.json({ limit: '512kb', strict: true });

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.post(
    '/',
    authenticateReadingCaptureAction(getConfiguredTokenHash),
    requireJsonContentType,
    jsonParser,
    asyncRoute(async (request, response) => {
      if (Object.keys(request.query).length > 0) {
        throw new ReadingValidationError(
          'unexpected_query_parameter',
          'Query parameters are not allowed.',
        );
      }
      const result = await service.createCaptureFromAction(
        request.body,
        request.get('Idempotency-Key'),
      );
      response.status(result.outcome === 'created' ? 201 : 200).json({
        success: true,
        data: {
          captureId: result.capture.id,
          bookTitle: result.capture.bookTitle,
          bookAuthor: result.capture.bookAuthor,
          status: result.capture.status,
          receivedAt: result.capture.receivedAt,
          replayed: result.outcome === 'replayed',
        },
      });
    }),
  );

  router.all('/', (_request, response) => {
    response.set('Allow', 'POST');
    sendError(
      response,
      405,
      'method_not_allowed',
      'Only POST is supported for this endpoint.',
    );
  });

  router.use((
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    sendReadingActionError(error, response);
  });

  return router;
}
