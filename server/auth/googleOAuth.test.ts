import test from 'node:test';
import assert from 'node:assert';
import {
  buildGoogleAuthorizationUrl,
  buildGoogleTokenExchangeBody,
  createSignedGoogleOAuthState,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_PRODUCTION_ORIGIN,
  GOOGLE_OAUTH_STAGING_ORIGIN,
  isUsableGoogleOAuthSession,
  resolveGoogleOAuthRedirectUri,
  UnapprovedGoogleOAuthHostError,
  validateSignedGoogleOAuthState,
} from './googleOAuth';

const productionHost = new URL(GOOGLE_OAUTH_PRODUCTION_ORIGIN).hostname;
const stagingHost = new URL(GOOGLE_OAUTH_STAGING_ORIGIN).hostname;

const requestOrigin = (
  host: string,
  overrides: Partial<Parameters<typeof resolveGoogleOAuthRedirectUri>[0]> = {},
) => ({ host, protocol: 'https', ...overrides });

test('Google OAuth production requests use the permanent production callback', () => {
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri(requestOrigin(productionHost)),
    `${GOOGLE_OAUTH_PRODUCTION_ORIGIN}${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );
});

test('Google OAuth staging requests accept matching forwarded HTTPS origin headers', () => {
  assert.strictEqual(
    resolveGoogleOAuthRedirectUri(requestOrigin(stagingHost, {
      forwardedHost: stagingHost,
      forwardedProtocol: 'https',
      protocol: 'http',
    })),
    `${GOOGLE_OAUTH_STAGING_ORIGIN}${GOOGLE_OAUTH_CALLBACK_PATH}`,
  );
});

test('Google OAuth authorization and callback phases resolve the same redirect URI', () => {
  for (const host of [productionHost, stagingHost]) {
    const redirectUri = resolveGoogleOAuthRedirectUri(requestOrigin(host, {
      forwardedHost: host,
      forwardedProtocol: 'https',
    }));
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

test('Google OAuth rejects unknown, conflicting, and malformed origin headers', () => {
  const rejectedOrigins = [
    requestOrigin('unknown.example.com'),
    requestOrigin('predeploy-20260717-4---life-site-dashboard-uggsbwiuvq-nw.a.run.app'),
    requestOrigin(`${stagingHost}:443`),
    requestOrigin(`attacker.example.com@${stagingHost}`),
    requestOrigin(stagingHost, { forwardedHost: productionHost }),
    requestOrigin(stagingHost, { forwardedHost: `${stagingHost}, attacker.example.com` }),
    requestOrigin(stagingHost, { forwardedProtocol: 'http' }),
    requestOrigin(stagingHost, { forwardedProtocol: 'https,http' }),
  ];

  for (const origin of rejectedOrigins) {
    assert.throws(
      () => resolveGoogleOAuthRedirectUri(origin),
      UnapprovedGoogleOAuthHostError,
    );
  }
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
