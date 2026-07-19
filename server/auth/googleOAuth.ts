import crypto from 'crypto';

export const GOOGLE_OAUTH_CALLBACK_PATH = '/api/auth/google/callback';
export const GOOGLE_OAUTH_PRODUCTION_ORIGIN =
  'https://life-site-dashboard-708819606972.europe-west2.run.app';
export const GOOGLE_OAUTH_STAGING_ORIGIN =
  'https://life-site-dashboard-staging-708819606972.europe-west2.run.app';

const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const APPROVED_ORIGINS_BY_HOST = new Map<string, string>([
  [new URL(GOOGLE_OAUTH_PRODUCTION_ORIGIN).hostname, GOOGLE_OAUTH_PRODUCTION_ORIGIN],
  [new URL(GOOGLE_OAUTH_STAGING_ORIGIN).hostname, GOOGLE_OAUTH_STAGING_ORIGIN],
]);

export class UnapprovedGoogleOAuthHostError extends Error {
  constructor() {
    super('The request host is not approved for Google OAuth.');
    this.name = 'UnapprovedGoogleOAuthHostError';
  }
}

export type GoogleOAuthRequestOrigin = {
  host: string | undefined;
  forwardedHost?: string | undefined;
  forwardedProtocol?: string | undefined;
  protocol: string | undefined;
};

export type GoogleOAuthRuntime = {
  nodeEnv?: string | undefined;
  cloudRunService?: string | undefined;
};

function parseSingleHeader(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || value !== value.trim() || value.includes(',')) {
    throw new UnapprovedGoogleOAuthHostError();
  }
  return value.toLowerCase();
}

function isDeployedRuntime(runtime: GoogleOAuthRuntime): boolean {
  return runtime.nodeEnv?.trim().toLowerCase() === 'production' ||
    !!runtime.cloudRunService?.trim();
}

function resolveLocalDevelopmentOrigin(host: string, protocol: string): string {
  if (protocol !== 'http' && protocol !== 'https') {
    throw new UnapprovedGoogleOAuthHostError();
  }

  let url: URL;
  try {
    url = new URL(`${protocol}://${host}`);
  } catch {
    throw new UnapprovedGoogleOAuthHostError();
  }

  const approvedLoopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    url.host !== host ||
    !approvedLoopbackHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new UnapprovedGoogleOAuthHostError();
  }

  return url.origin;
}

export function resolveGoogleOAuthRedirectUri(
  requestOrigin: GoogleOAuthRequestOrigin,
  runtime: GoogleOAuthRuntime = {
    nodeEnv: process.env.NODE_ENV,
    cloudRunService: process.env.K_SERVICE,
  },
): string {
  const host = parseSingleHeader(requestOrigin.host);
  const forwardedHost = parseSingleHeader(requestOrigin.forwardedHost);
  const forwardedProtocol = parseSingleHeader(requestOrigin.forwardedProtocol);
  const protocol = parseSingleHeader(requestOrigin.protocol);

  if (
    !host ||
    !protocol ||
    (forwardedHost && forwardedHost !== host) ||
    (protocol !== 'http' && protocol !== 'https')
  ) {
    throw new UnapprovedGoogleOAuthHostError();
  }

  if (forwardedProtocol && forwardedProtocol !== 'http' && forwardedProtocol !== 'https') {
    throw new UnapprovedGoogleOAuthHostError();
  }

  const effectiveProtocol = forwardedProtocol || protocol;
  if (isDeployedRuntime(runtime)) {
    if (effectiveProtocol !== 'https') {
      throw new UnapprovedGoogleOAuthHostError();
    }

    const approvedOrigin = APPROVED_ORIGINS_BY_HOST.get(forwardedHost || host);
    if (!approvedOrigin) {
      throw new UnapprovedGoogleOAuthHostError();
    }

    return `${approvedOrigin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  }

  const localOrigin = resolveLocalDevelopmentOrigin(forwardedHost || host, effectiveProtocol);
  return `${localOrigin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

export function buildGoogleAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  scope: string,
  state: string,
): string {
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${parameters.toString()}`;
}

export function buildGoogleTokenExchangeBody(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): string {
  return new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString();
}

function signGoogleOAuthState(sessionToken: string, expiry: number, sessionSecret: string): string {
  return crypto.createHmac('sha256', sessionSecret)
    .update(`${sessionToken}:${expiry}`)
    .digest('hex');
}

export function createSignedGoogleOAuthState(
  sessionToken: string,
  sessionSecret: string,
  now = Date.now(),
): string {
  const expiry = now + GOOGLE_OAUTH_STATE_TTL_MS;
  const signature = signGoogleOAuthState(sessionToken, expiry, sessionSecret);
  return `${expiry}.${signature}`;
}

export type GoogleOAuthStateValidation =
  | { valid: true }
  | { valid: false; reason: 'malformed' | 'expired' | 'invalid_signature' };

export function validateSignedGoogleOAuthState(
  state: string,
  sessionToken: string,
  sessionSecret: string,
  now = Date.now(),
): GoogleOAuthStateValidation {
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' };
  }

  const expiry = Number(parts[0]);
  if (!Number.isSafeInteger(expiry)) {
    return { valid: false, reason: 'malformed' };
  }
  if (expiry < now) {
    return { valid: false, reason: 'expired' };
  }

  const expectedSignature = signGoogleOAuthState(sessionToken, expiry, sessionSecret);
  const suppliedSignature = parts[1];
  if (!/^[0-9a-f]{64}$/i.test(suppliedSignature)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  const signaturesMatch = crypto.timingSafeEqual(
    Buffer.from(suppliedSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );
  return signaturesMatch
    ? { valid: true }
    : { valid: false, reason: 'invalid_signature' };
}

export function isUsableGoogleOAuthSession<T>(
  session: T | null | undefined,
  isExpired: (session: T) => boolean,
): session is T {
  return session !== null && session !== undefined && !isExpired(session);
}
