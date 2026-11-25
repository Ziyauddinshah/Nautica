import { ApiError } from '../errors.js';
const actions = {
  '/api/owner/verification/mobile/send': 'sendCode',
  '/api/owner/verification/mobile/verify': 'verifyCode',
  '/api/owner/verification/identity/start': 'startIdentity',
  '/api/owner/verification/identity/check': 'finishIdentity'
};
// Caller authenticates the customer session; actor IDs never come from the body.
export async function verificationRequest({
  req,
  url,
  repo,
  user,
  body,
  send,
  throttle,
  language
}) {
  if (!repo.verification) throw new ApiError(503, 'Identity verification is not configured.');
  if (req.method === 'GET' && url.pathname === '/api/owner/verification') return send(200, await repo.verification.status(user.id));
  const action = actions[url.pathname];
  if (req.method !== 'POST' || !action) throw new ApiError(404, 'Endpoint not found.');
  await throttle(req, action === 'sendCode' ? 'owner-otp-send' : action === 'verifyCode' ? 'owner-otp-verify' : 'owner-identity', user.id);
  return send(200, await repo.verification[action](user.id, {
    ...(await body()),
    language
  }));
}
