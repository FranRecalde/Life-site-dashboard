import crypto from 'crypto';
import { RequestHandler } from 'express';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export function isReadingApiTokenHashValid(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_PATTERN.test(value);
}

export function createReadingBearerAuthenticator(
  getConfiguredTokenHash: () => string,
  unavailable: { code: string; message: string },
): RequestHandler {
  return (request, response, next) => {
    const configuredHash = getConfiguredTokenHash();
    if (!isReadingApiTokenHashValid(configuredHash)) {
      response.status(503).json({
        success: false,
        error: unavailable.message,
        code: unavailable.code,
      });
      return;
    }

    const authorization = request.get('Authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      response.set('WWW-Authenticate', 'Bearer');
      response.status(401).json({
        success: false,
        error: 'Unauthorized.',
        code: 'unauthorized',
      });
      return;
    }

    const presentedHash = crypto
      .createHash('sha256')
      .update(match[1], 'utf8')
      .digest();
    const expectedHash = Buffer.from(configuredHash, 'hex');
    if (!crypto.timingSafeEqual(presentedHash, expectedHash)) {
      response.set('WWW-Authenticate', 'Bearer');
      response.status(401).json({
        success: false,
        error: 'Unauthorized.',
        code: 'unauthorized',
      });
      return;
    }

    next();
  };
}
