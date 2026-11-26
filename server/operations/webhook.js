/** @file HTTPS operational webhook transport with safe payloads and stable event identity. */
import { ApiError } from '../errors.js';
export function operationsWebhook(env = process.env, transport = fetch) {
  const target = env.OPERATIONS_WEBHOOK_URL,
    key = env.OPERATIONS_WEBHOOK_KEY;
  let enabled = false;
  try {
    const url = new URL(target);
    enabled =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!key || (key.length >= 32 && !/[\r\n]/.test(key)));
  } catch {}
  return {
    enabled,
    async send(event, id) {
      if (!enabled) return false;
      try {
        const response = await transport(target, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': id,
            ...(key
              ? {
                  Authorization: 'Bearer ' + key,
                }
              : {}),
          },
          body: JSON.stringify(event),
        });
        if (!response.ok) throw new Error();
        return true;
      } catch {
        throw new ApiError(503, 'Operational alert delivery is unavailable.');
      }
    },
  };
}
