/** @file Checkout usability tests cover held seats, server-clock countdown and read-only recovery. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import SeatMap from '../src/components/SeatMap.jsx';
import HoldCountdown from '../src/components/HoldCountdown.jsx';
import PaymentRecovery from '../src/components/PaymentRecovery.jsx';
import BookingDialog from '../src/components/BookingDialog.jsx';
import { boats, localDate, slots } from '../src/domain/booking.js';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
test('seat symbols and labels distinguish held seats; auto-selection skips both unavailable states', () => {
  const change = vi.fn();
  render(
    <SeatMap
      boat={boats[0]}
      guests={2}
      selected={['03']}
      held={['01']}
      booked={['02']}
      onChange={change}
    />,
  );
  expect(screen.getByRole('button', { name: /Seat 01,.*temporarily held/ }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: /Seat 02,.*booked/ }).disabled).toBe(true);
  expect(
    screen.getByRole('button', { name: /Seat 03,.*selected/ }).getAttribute('aria-pressed'),
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Choose seats for me' }));
  expect(change).toHaveBeenCalledWith(['03', '04']);
});
test('hold countdown uses server duration, warns and expires without claiming payment failed', () => {
  vi.useFakeTimers();
  try {
    render(<HoldCountdown hold={{ expires: 160000, serverNow: 100000 }} />);
    expect(screen.getByRole('timer').textContent).toBe('01:00');
    expect(screen.getByRole('status').textContent).toMatch(/Less than two minutes/);
    act(() => vi.advanceTimersByTime(61000));
    expect(screen.getByRole('timer').textContent).toBe('00:00');
    expect(screen.getByRole('status').textContent).toMatch(/Payment may still be processing/);
  } finally {
    vi.useRealTimers();
  }
});
test('recovery checks one owned request without creating orders and returns confirmed booking', async () => {
  const confirmed = vi.fn();
  let checks = 0;
  vi.mocked(fetch).mockImplementation(async () =>
    json(
      ++checks === 1 ? { status: 'created' } : { status: 'confirmed', booking: { id: 'NTC-123' } },
    ),
  );
  render(
    <PaymentRecovery requestKey="00000000-0000-0000-0000-000000000001" onConfirmed={confirmed} />,
  );
  await screen.findByText('Payment confirmation is still pending.');
  fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
  await waitFor(() => expect(confirmed).toHaveBeenCalledWith({ id: 'NTC-123' }));
  expect(
    fetch.mock.calls.every(
      ([path, options]) => path.startsWith('/api/payments/status?') && options.method === 'GET',
    ),
  ).toBe(true);
});
test('lost status connection keeps recovery available and never offers another charge', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  render(
    <PaymentRecovery requestKey="00000000-0000-0000-0000-000000000001" onConfirmed={vi.fn()} />,
  );
  await screen.findByText(/Unable to check payment status/);
  expect(screen.getByRole('button', { name: 'Check payment status' }).disabled).toBe(false);
  expect(
    screen.getByRole('link', { name: 'View booking and payment history' }).getAttribute('href'),
  ).toBe('/account');
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});
test('booking separates passenger details from payment and retains details when going back', async () => {
  render(
    <BookingDialog
      flow={{
        kind: 'booking',
        boat: boats[0],
        trip: {
          boatId: boats[0].id,
          date: localDate(),
          slot: slots[0],
          guests: 1,
          seats: [],
          extras: ['safety'],
        },
      }}
      passes={[]}
      currency="INR"
      user={{ name: 'Test Guest', email: 'guest@example.test', phone: '+919876543210' }}
      onCurrency={vi.fn()}
      onClose={vi.fn()}
      onBook={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Choose seats for me' }).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose seats for me' }));
  fireEvent.click(screen.getByRole('button', { name: /Continue to passenger details/ }));
  expect(screen.getByRole('heading', { name: 'Who is travelling?' })).toBeTruthy();
  expect(screen.queryByRole('tab', { name: 'UPI / QR' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Lead guest name'), {
    target: { value: 'Updated Guest' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Continue to payment/ }));
  expect(screen.getByRole('heading', { name: 'Review and pay' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to passenger details' }));
  expect(screen.getByLabelText('Lead guest name').value).toBe('Updated Guest');
  expect(fetch.mock.calls.some(([path]) => path === '/api/bookings')).toBe(false);
});
