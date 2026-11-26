/** @file Hosted checkout dismissal recovers a server-confirmed booking without a second order. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BookingDialog from '../src/components/BookingDialog.jsx';
import { boats, localDate, slots } from '../src/domain/booking.js';
test('dismissed hosted checkout checks the same attempt and recovers without charging again', async () => {
  const date = localDate(),
    onBook = vi.fn(),
    expires = Date.now() + 900000;
  let checkout,
    checks = 0;
  const pass = {
    id: 'NTC-ABCDEF123456',
    boatId: boats[0].id,
    date,
    slot: slots[0],
    guests: 1,
    seats: ['01'],
    extras: ['safety'],
    total: 1260,
    name: 'Guest Test',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
  };
  window.Razorpay = function (options) {
    checkout = options;
    this.open = vi.fn();
  };
  vi.mocked(fetch).mockImplementation(
    async (path) =>
      new Response(
        JSON.stringify(
          path === '/api/payments/config'
            ? { mode: 'razorpay', enabled: true }
            : path.startsWith('/api/availability?')
              ? { bookedSeats: [], heldSeats: [] }
              : path === '/api/payments/order'
                ? {
                    attemptId: 'attempt-test',
                    orderId: 'order_test',
                    keyId: 'rzp_test_public',
                    amount: 126000,
                    expires,
                    serverNow: Date.now(),
                  }
                : path.startsWith('/api/payments/status?')
                  ? ++checks === 1
                    ? { status: 'created', expires, serverNow: Date.now() }
                    : { status: 'confirmed', booking: pass }
                  : { error: 'Unexpected request' },
        ),
        { status: 200 },
      ),
  );
  try {
    render(
      <BookingDialog
        flow={{
          kind: 'booking',
          boat: boats[0],
          trip: {
            boatId: boats[0].id,
            date,
            slot: slots[0],
            guests: 1,
            seats: [],
            extras: ['safety'],
          },
        }}
        passes={[]}
        currency="INR"
        user={{ name: 'Guest Test', email: 'guest@example.test', phone: '+919876543210' }}
        onCurrency={vi.fn()}
        onClose={vi.fn()}
        onBook={onBook}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose seats for me' }).disabled).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose seats for me' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to passenger details/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continue to payment/ }));
    fireEvent.click(screen.getByRole('button', { name: /Pay with Razorpay/ }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2050));
    });
    expect(checkout.order_id).toBe('order_test');
    expect(screen.getByRole('timer')).toBeTruthy();
    act(() => checkout.modal.ondismiss());
    await screen.findByText('Payment confirmation is still pending.');
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    await screen.findByRole('heading', { name: 'Booking confirmed.' });
    expect(onBook).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.filter(([path]) => path === '/api/payments/order')).toHaveLength(1);
  } finally {
    delete window.Razorpay;
  }
});

test('an explicit conflict before hosted checkout opens can safely return to seat selection', async () => {
  const { payRazorpay } = await import('../src/lib/razorpay.js');
  const construct = vi.fn();
  window.Razorpay = function () {
    construct();
  };
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: 'Some seats were just booked.', bookedSeats: ['01'] }), {
      status: 409,
    }),
  );
  try {
    await expect(payRazorpay({ requestKey: 'synthetic-key' }, 'en')).rejects.toMatchObject({
      seatConflict: true,
      status: 409,
    });
    expect(construct).not.toHaveBeenCalled();
  } finally {
    delete window.Razorpay;
  }
});
