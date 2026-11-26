/** @file Regression tests for synchronization behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CustomerAccount from '../src/components/CustomerAccount.jsx';
import useBackgroundRefresh from '../src/hooks/useBackgroundRefresh.js';
import useCustomerSession from '../src/hooks/useCustomerSession.js';
import { boats, slots } from '../src/domain/booking.js';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const user = {
  id: 'sync-user',
  name: 'Same Account',
  email: 'sync@example.test',
  phone: '+919876543210',
  createdAt: '2026-11-19T00:00:00Z',
};
const record = {
  id: 'NTC-123456ABCDEF',
  status: 'confirmed',
  createdAt: '2026-11-19T01:00:00Z',
  boat: boats[0],
  trip: { date: '2027-01-15', slot: slots[0], guests: 1, seats: ['01'] },
  payment: { amount: 126000, method: 'Razorpay', status: 'paid' },
  notifications: [{ audience: 'customer', status: 'sent' }],
};
test('returning to the account page reloads bookings created on another device without saving private data locally', async () => {
  let records = [];
  vi.mocked(fetch).mockImplementation(async () =>
    json({ bookings: records, total: records.length }),
  );
  render(<CustomerAccount user={user} onUser={() => {}} currency="INR" onCurrency={() => {}} />);
  await screen.findByText('No bookings yet. Choose a boat to plan your first trip.');
  records = [record];
  fireEvent(window, new Event('focus'));
  await screen.findByText('Ganges Dawn');
  expect(localStorage.length).toBe(0);
  records = [];
  fireEvent(window, new Event('online'));
  await screen.findByText('No bookings yet. Choose a boat to plan your first trip.');
});
test('visible tabs poll for changes; hidden tabs pause and unmount removes refresh listeners', () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('visible');
  function Probe() {
    return <p>{useBackgroundRefresh(true)}</p>;
  }
  try {
    const { unmount } = render(<Probe />);
    expect(screen.getByText('0')).toBeTruthy();
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByText('1')).toBeTruthy();
    visibility.mockReturnValue('hidden');
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByText('1')).toBeTruthy();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByText('2')).toBeTruthy();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
test('temporary network failures keep an existing session; an authentication rejection clears it', async () => {
  let status = 200;
  vi.mocked(fetch).mockImplementation(async () =>
    json(status === 200 ? { user } : { error: 'Unavailable' }, status),
  );
  function Probe() {
    const { user: account } = useCustomerSession();
    return <p>{account?.email || 'signed out'}</p>;
  }
  render(<Probe />);
  await screen.findByText(user.email);
  status = 503;
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByText(user.email)).toBeTruthy();
  status = 401;
  fireEvent(window, new Event('focus'));
  await screen.findByText('signed out');
});
