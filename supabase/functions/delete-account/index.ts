// Permanently deletes the signed-in user's account:
//   1. Ownership of their trips passes to the longest-standing member (trips
//      with no other members are deleted).
//   2. Every photo and video they uploaded is deleted, in every trip.
//   3. The auth user is deleted, cascading memberships, blocks and profile.
//   4. Queued storage files are purged immediately.
//   5. If they signed in with Apple and the app sent a fresh authorization
//      code, the Apple refresh token is revoked.
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';
import { adminClient, json, purgeQueuedObjects } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let appleAuthorizationCode: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.appleAuthorizationCode === 'string' && body.appleAuthorizationCode.length < 2048) {
      appleAuthorizationCode = body.appleAuthorizationCode;
    }
  } catch {
    // Empty body is fine.
  }

  try {
    const { error: prepError } = await admin.rpc('prepare_account_deletion', { p_user: userId });
    if (prepError) throw prepError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    // Best effort; anything left is picked up by the scheduled purge.
    await purgeQueuedObjects(admin).catch(() => undefined);

    const appleRevoked = appleAuthorizationCode
      ? await revokeAppleToken(appleAuthorizationCode).catch(() => false)
      : false;

    return json({ deleted: true, appleRevoked });
  } catch (err) {
    console.error('delete-account failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'delete_failed' }, 500);
  }
});

/**
 * Exchanges a fresh Sign in with Apple authorization code for a refresh token
 * and revokes it (Apple's token revocation requirement for account deletion).
 * Requires APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY and APPLE_CLIENT_ID.
 */
async function revokeAppleToken(code: string): Promise<boolean> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  if (!teamId || !keyId || !privateKey || !clientId) return false;

  const key = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256');
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(key);

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return false;
  const { refresh_token: refreshToken } = await tokenRes.json();
  if (!refreshToken) return false;

  const revokeRes = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
  return revokeRes.ok;
}
