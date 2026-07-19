import test from 'node:test';
import assert from 'node:assert';
import {
  buildGoogleAuthorizationUrl,
  buildGoogleTokenExchangeBody,
  createSignedGoogleOAuthState,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_PRODUCTION_ORIGIN,
  GOOGLE_OAUTH_STAGING_ORIGIN,
  type GoogleOAuthRuntime,
  isUsableGoogleOAuthSession,
  resolveGoogleOAuthRedirectUri,
  UnapprovedGoogleOAuthHostError,
  validateSignedGoogleOAuthState,
} from './googleOAuth';

const productionHost = new URL(GOOGLE_OAUTH_PRODUCTION_ORIGIN).hostname;
const stagingHost = new URL(GOOGLE_OAUTH_STAGING_ORIGIN).hostname;
const obsoleteStagingTagHost = 'staging---life-site-dashboard-uggsbwiuvq-nw.a.run.app';
const obsoletePredeployHost = 'predeploy-20260717-4---life-site-dashboard-uggsbwiuvq-nw.a.run.app';

const productionRuntime: GoogleOAuthRuntime = { nodeEnv: 'production' };
const cloudRunRuntime: GoogleOAuthRuntime = {
  nodeEnv: 'development',
  cloudRunService: 'life-site-dashboard-staging',
};
const localRuntime: GoogleOAuthRuntime = { nodeEnv: 'development' };

const requestOrigin = (
  host: string,
  overrides: Partial<Parameters<typeof resolveGoogleOAuthRedirectUri>[0]> = {},
) => ({ host, protocol: 'https', ...overrides });

const assertRejected = (
  origin: Parameters<typeof resolveGoogleOAuthRedirectUri>[0],
  runtime: GoogleOAuthRuntime = productionRuntime,
) => {
  assert.throws(
    () => resolveGoogleOAuthRedirectUri(origin, runtime),
    UnapprovedGoogleOAuthHostError,
  );
};

test('Google OAuth production accepts only the permanent production callback', () => {
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri(requestOrigin(productionHost), productionRuntime),
    `${GOOGLE_OAUTH_PRODUCTION_ORIGIN}${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );
});

test('Google OAuth accepts the permanent separate staging-service callback', () => {
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri(requestOrigin(stagingHost, {
      forwardedHost: stagingHost,
      forwardedProtocol: 'https',
      protocol: 'http',
    }), cloudRunRuntime),
    `${GOOGLE_OAUTH_STAGING_ORIGIN}${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );
});

test('Google OAuth rejects obsolete, unknown, and arbitrary Cloud Run hosts', () => {
  for (const host of [
    obsoleteStagingTagHost,
    obsoletePredeployHost,
    'unknown-life-site-dashboard-708819606972.europe-west2.run.app',
    'attacker.run.app',
    'unknown.example.com',
  ]) {
    assertRejected(requestOrigin(host));
  }
});

test('Google OAuth rejects non-HTTPS and malformed deployed protocol information', () => {
  const rejectedOrigins = [
    requestOrigin(productionHost, { protocol: 'http' }),
    requestOrigin(productionHost, { forwardedProtocol: 'http', protocol: 'http' }),
    requestOrigin(productionHost, { forwardedProtocol: 'https,http' }),
    requestOrigin(productionHost, { forwardedProtocol: ' https' }),
    requestOrigin(productionHost, { forwardedProtocol: 'ftp' }),
    requestOrigin(productionHost, { forwardedProtocol: 'https', protocol: 'ftp' }),
  ];

  for (const origin of rejectedOrigins) {
    assertRejected(origin);
  }
});

test('Google OAuth rejects conflicting, malformed, and multi-valued host information', () => {
  const rejectedOrigins = [
    requestOrigin(stagingHost, { forwardedHost: productionHost }),
    requestOrigin(stagingHost, { forwardedHost: `${stagingHost},attacker.example.com` }),
    requestOrigin(stagingHost, { forwardedHost: ` ${stagingHost}` }),
    requestOrigin(`${stagingHost}:443`),
    requestOrigin(`attacker.example.com@${stagingHost}`),
    requestOrigin(`${productionHost},${stagingHost}`),
  ];

  for (const origin of rejectedOrigins) {
    assertRejected(origin);
  }
});

test('Google OAuth authorization and token exchange use the same redirect URI', () => {
  for (const host of [productionHost, stagingHost]) {
    const redirectUri = resolveGoogleOAuthRedirectUri(requestOrigin(host, {
      forwardedHost: host,
      forwardedProtocol: 'https',
      protocol: 'http',
    }), productionRuntime);
    const authorizationUrl = new URL(buildGoogleAuthorizationUrl(
      'client-id',
      redirectUri,
      'calendar-scope',
      'signed-state',
    ));
    const tokenExchangeBody = new URLSearchParams(buildGoogleTokenExchangeBody(
      'authorization-code',
      'client-id',
      'client-secret',
      redirectUri,
    ));

    assert.strictEqual(
      tokenExchangeBody.get('redirect_uri'),
      authorizationUrl.searchParams.get('redirect_uri'),
    );
  }
});

test('Google OAuth deployed callbacks ignore stale APP_URL values', () => {
  const originalAppUrl = process.env.APP_URL;
  process.env.APP_URL = `https://${obsoleteStagingTagHost}`;

  try {
    assert.strictEqual(
      resolveGoogleOAuthRedirectUri(requestOrigin(productionHost), productionRuntime),
      `${GOOGLE_OAUTH_PRODUCTION_ORIGIN}${GOOGLE_OAUTH_CALLBACK_PATH}`,
    );
    assertRejected(requestOrigin(obsoleteStagingTagHost));
  } finally {
    if (originalAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalAppUrl;
    }
  }
});

test('Google OAuth permits explicit loopback callbacks only in local development', () => {
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri({
      host: 'localhost:3000',
      protocol: 'http',
    }, localRuntime),
    `http://localhost:3000${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri({
      host: '127.0.0.1:5173',
      forwardedHost: '127.0.0.1:5173',
      forwardedProtocol: 'http',
      protocol: 'http',
    }, localRuntime),
    `http://127.0.0.1:5173${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );

  assertRejected({ host: 'localhost:3000', protocol: 'http' }, productionRuntime);
  assertRejected({ host: 'localhost:3000', protocol: 'https' }, cloudRunRuntime);
  assertRejected({ host: 'dev.example.com', protocol: 'https' }, localRuntime);
});

test('Google OAuth host-validation errors do not reveal rejected input', () => {
  const privateMarker = 'private-host-marker.example.com';
  let caught: unknown;

  try {
    resolveGoogleOAuthRedirectUri(requestOrigin(privateMarker), productionRuntime);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof UnapprovedGoogleOAuthHostError);
  assert.strictEqual(caught.message.includes(privateMarker), false);
  assert.strictEqual(caught.message, 'The request host is not approved for Google OAuth.');
});

test('Google OAuth signed state rejects tampering and expiry', () => {
  const now = 1_750_000_000_000;
  const state = createSignedGoogleOAuthState('session-token', 'session-secret', now);

  assert.deepStrictEqual(
    validateSignedGoogleOAuthState(state, 'session-token', 'session-secret', now),
    { valid: true },
  );
  assert.deepStrictEqual(
    validateSignedGoogleOAuthState(state, 'different-session', 'session-secret', now),
    { valid: false, reason: 'invalid_signature' },
  );
  assert.deepStrictEqual(
    validateSignedGoogleOAuthState(state, 'session-token', 'session-secret', now + 10 * 60 * 1000 + 1),
    { valid: false, reason: 'expired' },
  );
});

test('Google OAuth session validation rejects missing and expired sessions', () => {
  type Session = { expiresAt: number };
  const isExpired = (session: Session) => session.expiresAt <= 100;

  assert.strictEqual(isUsableGoogleOAuthSession<Session>(null, isExpired), false);
  assert.strictEqual(isUsableGoogleOAuthSession({ expiresAt: 100 }, isExpired), false);
  assert.strictEqual(isUsableGoogleOAuthSession({ expiresAt: 101 }, isExpired), true);
});
