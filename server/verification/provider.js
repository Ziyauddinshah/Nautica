import { ApiError } from '../errors.js';
// Adapter for a merchant-controlled bridge to an authorized identity provider.
// This is an explicit integration contract, not an invented UIDAI API.
export function identityProvider(env = process.env, transport = fetch) {
  const base = env.IDENTITY_BRIDGE_URL,
    key = env.IDENTITY_BRIDGE_KEY,
    checkout = env.IDENTITY_CHECKOUT_ORIGIN;
  let enabled = false;
  try {
    const url = new URL(base),
      origin = new URL(checkout);
    enabled = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && origin.protocol === 'https:' && origin.origin === checkout && key?.length >= 32;
  } catch {}
  async function call(path, body) {
    if (!enabled) throw new ApiError(503, 'Identity verification is not configured.');
    try {
      const response = await transport(base.replace(/\/$/, '') + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer ' + key,
          ...(body ? {
            'Content-Type': 'application/json'
          } : {})
        },
        ...(body ? {
          body: JSON.stringify(body)
        } : {}),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result;
    } catch {
      throw new ApiError(503, 'Identity verification is temporarily unavailable.');
    }
  }
  return {
    enabled,
    async start({
      userId,
      requestId,
      method
    }) {
      const result = await call('/sessions', {
        subject: userId,
        requestId,
        method,
        purpose: 'boat_owner_registration',
        consentVersion: 'owner-identity-v1'
      });
      let url;
      try {
        url = new URL(result.url);
      } catch {}
      if (!url || url.origin !== checkout || url.username || url.password || url.hash || typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{8,150}$/.test(result.id)) throw new ApiError(503, 'Identity verification is temporarily unavailable.');
      return {
        id: result.id,
        url: url.href
      };
    },
    async result(id) {
      return call('/sessions/' + encodeURIComponent(id));
    }
  };
}
