/** @file Regression tests for journey history behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomerAccount from '../src/components/CustomerAccount.jsx';
import { I18nProvider } from '../src/i18n/I18nProvider.jsx';
import { boats, slots } from '../src/domain/booking.js';
const user = {
  id: 'owner',
  name: 'Guest',
  email: 'owner@example.test',
  phone: '+919876543210',
  createdAt: '2020-01-01T00:00:00Z',
};
const counts = { all: 56, upcoming: 1, past: 55 };
const record = (id, date) => ({
  id,
  status: 'confirmed',
  createdAt: '2020-01-01T00:00:00Z',
  boat: boats[0],
  trip: { date, slot: slots[0], guests: 1, seats: ['01'] },
  payment: { status: 'demo_paid', amount: 126000, method: 'UPI' },
  notifications: [],
});
const json = (body) => new Response(JSON.stringify(body));
test('upcoming and previous tabs query the server before pagination and reset pages when switching sections', async () => {
  vi.mocked(fetch).mockImplementation(async (path) => {
    const url = new URL(path, 'http://localhost');
    const view = url.searchParams.get('view');
    return json({
      bookings: [
        record(view === 'past' ? 'PAST' : 'FUTURE', view === 'past' ? '2020-01-01' : '2030-01-01'),
      ],
      counts,
      total: view === 'past' ? 55 : 1,
      paymentTotal: 57,
    });
  });
  render(<CustomerAccount user={user} onUser={() => {}} currency="INR" onCurrency={() => {}} />);
  await screen.findByText('FUTURE');
  fireEvent.click(screen.getByRole('tab', { name: 'Previous bookings' }));
  await screen.findByText('PAST');
  expect(screen.queryByText('FUTURE')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain('offset=50'));
  fireEvent.click(screen.getByRole('tab', { name: 'Upcoming journeys' }));
  await screen.findByText('FUTURE');
  expect(fetch.mock.calls.at(-1)[0]).toContain('view=upcoming');
  expect(fetch.mock.calls.at(-1)[0]).toContain('offset=0');
  expect(screen.queryByText('PAST')).toBeNull();
});
test('payment history uses its own endpoint, includes refund attempts and shows INR even when display currency is USD', async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    path.startsWith('/api/user/payments?')
      ? json({
          payments: [
            {
              id: 'attempt',
              source: 'attempt',
              bookingId: null,
              amount: 126000,
              status: 'refund_required',
              method: 'Razorpay',
              reference: 'pay_refund',
              boat: boats[0],
              createdAt: '2026-11-21T00:00:00Z',
            },
          ],
          counts,
          total: 1,
        })
      : json({ bookings: [], counts, total: 56 }),
  );
  render(<CustomerAccount user={user} onUser={() => {}} currency="USD" onCurrency={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Payment history' }));
  await screen.findByText('pay_refund');
  expect(screen.getByText('Refund required')).toBeTruthy();
  expect(screen.getByText('No confirmed booking')).toBeTruthy();
  expect(screen.getByText('₹1,260.00')).toBeTruthy();
  expect(screen.queryByText('No payment records yet.')).toBeNull();
  expect(localStorage.length).toBe(0);
});
test('new history sections and empty states are available in Hindi', async () => {
  localStorage.setItem('nautica.language', 'hi');
  vi.mocked(fetch).mockResolvedValue(
    json({ bookings: [], counts: { all: 0, upcoming: 0, past: 0 }, total: 0 }),
  );
  render(
    <I18nProvider>
      <CustomerAccount user={user} onUser={() => {}} currency="INR" onCurrency={() => {}} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'आगामी यात्राएँ' }));
  await screen.findByText('कोई आगामी यात्रा नहीं है। अगली यात्रा के लिए नावें देखें।');
  expect(screen.getByRole('tab', { name: 'पिछली बुकिंग' })).toBeTruthy();
});
test('account counts remain visible on security while history from another owner is never rendered', async () => {
  vi.mocked(fetch).mockResolvedValue(
    json({
      bookings: [record('PRIVATE_BOOKING', '2030-01-01')],
      counts,
      total: 56,
      paymentTotal: 57,
    }),
  );
  const view = render(
    <CustomerAccount user={user} onUser={() => {}} currency="INR" onCurrency={() => {}} />,
  );
  await screen.findByText('PRIVATE_BOOKING');
  fireEvent.click(screen.getByRole('tab', { name: 'Account security' }));
  expect(screen.getByRole('button', { name: 'Upcoming journeys 1' })).toBeTruthy();
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  view.rerender(
    <CustomerAccount
      user={{ ...user, id: 'different-owner' }}
      onUser={() => {}}
      currency="INR"
      onCurrency={() => {}}
    />,
  );
  expect(screen.queryByText('PRIVATE_BOOKING')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Upcoming journeys 1' })).toBeNull();
});
