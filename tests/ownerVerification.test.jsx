/** @file Regression tests for owner verification behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OwnerVerification from '../src/components/OwnerVerification.jsx';
const user = {
  id: 'owner',
  name: 'Owner',
  phone: '+919876543210',
};
const json = (data) => Response.json(data);
test('mobile code controls require consent and send no Aadhaar data or client verification claims', async () => {
  let verified = false;
  const onStatus = vi.fn();
  vi.mocked(fetch).mockImplementation(async (path, options = {}) =>
    path.endsWith('/mobile/send')
      ? json({
          sent: true,
        })
      : path.endsWith('/mobile/verify')
        ? ((verified = true),
          json({
            verified: true,
          }))
        : json({
            mobileEnabled: true,
            identityEnabled: false,
            mobileVerified: verified,
            identityVerified: false,
          }),
  );
  render(<OwnerVerification user={user} onStatus={onStatus} />);
  await screen.findByText(
    'Identity verification is not configured. Contact support to arrange an authorized verification method.',
  );
  expect(
    screen.getByRole('button', {
      name: 'Send verification code',
    }).disabled,
  ).toBe(true);
  expect(
    screen.queryByRole('textbox', {
      name: /Aadhaar number/i,
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByLabelText('I agree to receive an SMS code to verify this mobile number.'),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Send verification code',
    }),
  );
  await screen.findByLabelText('Six digit verification code');
  fireEvent.change(screen.getByLabelText('Six digit verification code'), {
    target: {
      value: '123456',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Verify mobile',
    }),
  );
  await screen.findByText('Mobile number verified.');
  const sent = fetch.mock.calls.find(([path]) => path.endsWith('/mobile/send'));
  expect(JSON.parse(sent[1].body)).toEqual({
    phone: user.phone,
    consent: true,
  });
  const confirm = fetch.mock.calls.find(([path]) => path.endsWith('/mobile/verify'));
  expect(JSON.parse(confirm[1].body)).toEqual({
    code: '123456',
  });
  expect(localStorage.length).toBe(0);
  expect(onStatus).toHaveBeenLastCalledWith(false);
});
test('unconfigured verification cannot unlock owner registration and offers an Aadhaar alternative', async () => {
  const onStatus = vi.fn();
  vi.mocked(fetch).mockResolvedValue(
    json({
      mobileEnabled: false,
      identityEnabled: false,
      mobileVerified: false,
      identityVerified: false,
    }),
  );
  render(<OwnerVerification user={user} onStatus={onStatus} />);
  await waitFor(() => expect(onStatus).toHaveBeenCalledWith(false));
  expect(
    screen.getByRole('button', {
      name: 'Continue to identity verification',
    }).disabled,
  ).toBe(true);
  expect(
    screen.getByRole('option', {
      name: 'Alternative identity',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Send verification code',
    }).disabled,
  ).toBe(true);
});
