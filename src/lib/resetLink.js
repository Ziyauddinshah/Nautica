/** @file Browser helper for reset link; keep private server settings out of this module. */
// Called once before React/StrictMode mounts. Never put this bearer token in storage or a query string.
export function consumeResetToken(location, history) {
  if (location.pathname.replace(/\/$/, '') !== '/reset-password') return null;
  const value = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null, '', location.pathname);
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function consumeVerificationToken(location, history) {
  if (location.pathname.replace(/\/$/, '') !== '/verify-email') return null;
  const value = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null, '', location.pathname);
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
