/** @file Regression tests for privacy behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { boardingQrPayload } from '../src/domain/boardingPass.js';
import { request } from '../src/lib/api.js';
import AdminDashboard from '../src/components/AdminDashboard.jsx';

test('boarding QR contains only trip and seat identity, not passenger or payment/security data', () => {
  const data = JSON.parse(
    boardingQrPayload({
      id: 'NTC-ABCDEF123456',
      boatId: 'b1',
      date: '2027-01-15',
      slot: 'Sunrise · 5:30 AM',
      guests: 2,
      seats: ['02', '01', '01', '99'],
      name: 'PRIVATE_NAME',
      email: 'private@example.test',
      phone: 'PRIVATE_PHONE',
      method: 'PRIVATE_CARD',
      paymentReference: 'PRIVATE_PAYMENT',
      resetToken: 'PRIVATE_TOKEN',
      smtpPassword: 'PRIVATE_SMTP',
    }),
  );
  expect(data).toEqual({
    version: 1,
    bookingId: 'NTC-ABCDEF123456',
    boatId: 'b1',
    date: '2027-01-15',
    slot: 'Sunrise · 5:30 AM',
    guests: 2,
    seats: ['01', '02'],
  });
  expect(JSON.stringify(data)).not.toContain('PRIVATE_');
});
test('client renders a generic server error and discards arbitrary error metadata', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        error: 'SMTP password PRIVATE_SECRET at /config/private.env',
        stack: 'PRIVATE_STACK',
        credentials: 'PRIVATE_CREDENTIALS',
      }),
      { status: 503 },
    ),
  );
  try {
    await request('/api/test');
    throw new Error('Expected request to fail.');
  } catch (error) {
    expect(error.message).toBe('Something went wrong. Please try again later.');
    expect(JSON.stringify(error.data)).not.toContain('PRIVATE_');
  }
});
test('public admin sign-in does not advertise server setup commands', async () => {
  render(<AdminDashboard />);
  await screen.findByRole('button', { name: 'Sign in as admin' });
  expect(screen.queryByText(/npm run/)).toBeNull();
  expect(screen.queryByText(/\.env/)).toBeNull();
});

test('malformed response bodies never expose parser or object-access errors', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('null', { status: 200 }));
  await expect(request('/api/test')).rejects.toThrow(
    'Something went wrong. Please try again later.',
  );
});
