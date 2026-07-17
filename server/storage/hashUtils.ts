import crypto from 'crypto';

/**
 * Returns a SHA-256 hash of the given token as a hex string.
 * This is used to hash session tokens before querying or storing in Firestore.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
