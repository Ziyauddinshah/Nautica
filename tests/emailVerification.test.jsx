/** @file Email verification requires explicit account confirmation and does not consume a link on page load. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifyEmail, { EmailVerificationNotice } from '../src/components/EmailVerification.jsx';
import { consumeVerificationToken } from '../src/lib/resetLink.js';
const user = { id: 'user', email: 'guest@example.test', emailVerified: false };
test('verification fragment is removed before React mounts and is never stored', () => {
  const replaceState = vi.fn();
  const token = 'a'.repeat(64);
  expect(
    consumeVerificationToken(
      { pathname: '/verify-email', hash: '#token=' + token },
      { replaceState },
    ),
  ).toBe(token);
  expect(replaceState).toHaveBeenCalledWith(null, '', '/verify-email');
  expect(localStorage.length).toBe(0);
});
test('opening a verification page does not submit proof; explicit confirmation refreshes the account', async () => {
  const onUser = vi.fn();
  vi.mocked(fetch).mockImplementation(async (path) =>
    Response.json(
      path === '/api/user/session' ? { user: { ...user, emailVerified: true } } : { ok: true },
    ),
  );
  render(<VerifyEmail user={user} token={'b'.repeat(64)} onUser={onUser} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm email verification' }));
  await waitFor(() => expect(onUser).toHaveBeenCalledWith({ ...user, emailVerified: true }));
  expect(localStorage.length).toBe(0);
});
test('verification notices request a link without a client-selected recipient', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  render(<EmailVerificationNotice user={user} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send verification link' }));
  await screen.findByText(/Verification link requested/);
  expect(fetch.mock.calls[0][0]).toBe('/api/user/email/request');
  expect(fetch.mock.calls[0][1].body).toBe('{}');
});
