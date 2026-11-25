import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';
import { PASSES_KEY } from '../src/lib/storage.js';

async function startPayment() {
  await screen.findByRole('link',{name:'My account'});
  fireEvent.click(screen.getByRole('button', { name: 'Choose seats on Ganges Dawn' }));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Choose seats for me'}).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Choose seats for me' }));
  fireEvent.click(screen.getByRole('button', { name: /Proceed to payment/ }));
  fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'guest@example.com'}});
  fireEvent.change(screen.getByLabelText('Phone number'),{target:{value:'+919876543210'}});
}
async function finishPayment() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 2050)); }); }

describe('React booking flow', () => {
  it('filters the fleet and enforces one selected seat per guest', async () => {
    render(<App/>);
    expect(await screen.findAllByRole('article')).toHaveLength(8);
    fireEvent.change(screen.getByLabelText('BOARDING PIER'), { target: { value: 'Assi Ghat' } });
    expect(screen.getAllByRole('article')).toHaveLength(2);
    await screen.findByRole('link',{name:'My account'});
    fireEvent.click(screen.getByRole('button', { name: 'Choose seats on Ganges Dawn' }));
    await waitFor(()=>expect(screen.getByRole('button',{name:/Seat 01,/}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Proceed to payment/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/choose 2 seats/);
    const first = screen.getByRole('button', { name: /Seat 01,/ });
    fireEvent.click(first);fireEvent.click(screen.getByRole('button', { name: /Seat 04,/ }));
    fireEvent.click(screen.getByRole('button', { name: /Seat 05,/ }));
    expect(within(screen.getByRole('dialog')).getAllByRole('button', { pressed: true })).toHaveLength(2);
    fireEvent.click(first);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Seat 06,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch currency' }));
    expect(screen.getByRole('button', { name: /Proceed to payment/ }).textContent).toContain('$15.18');
    fireEvent.click(screen.getByRole('button', { name: /Proceed to payment/ }));
    expect(screen.getByText(/Seats: 04, 06/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back to your extras/ }));
    expect(screen.getByRole('button', { name: /Seat 06,/ }).getAttribute('aria-pressed')).toBe('true');
  });
  it('validates UPI, saves selected seats, prevents duplicates, and reopens saved passes', async () => {
    const view = render(<App/>);await startPayment();
    fireEvent.change(screen.getByLabelText('Lead guest name'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button', { name: /Verify & pay/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/full name/);
    fireEvent.change(screen.getByLabelText('Lead guest name'), { target: { value: 'आरव शर्मा · Élodie' } });
    fireEvent.change(screen.getByLabelText('UPI ID'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & pay/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/valid UPI/);
    fireEvent.change(screen.getByLabelText('UPI ID'), { target: { value: 'alex@okaxis' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify & pay/ }));
    expect(screen.getByRole('button', { name: 'Close booking' }).disabled).toBe(true);
    await finishPayment();
    expect(screen.getByRole('heading', { name: 'Booking confirmed.' })).toBeTruthy();
    expect(localStorage.getItem(PASSES_KEY)).toBeNull();
    const sent=JSON.parse(fetch.mock.calls.find(([path,options])=>path==='/api/bookings'&&options.method==='POST')[1].body);
    expect(sent.seats).toEqual(['01','02']);expect(JSON.stringify(sent)).not.toContain('alex@okaxis');
    view.unmount();render(<App/>);
    await screen.findByRole('link',{name:'My account'});
    fireEvent.click(screen.getByRole('button', { name: /My passes/ }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /Ganges Dawn/ }));
    expect(screen.getByRole('heading', { name: 'आरव शर्मा · Élodie' })).toBeTruthy();
    expect(screen.getByText('01, 02')).toBeTruthy();
  });
  it('validates card expiry and stores only a method label with the last four digits', async () => {
    render(<App/>);await startPayment();
    fireEvent.change(screen.getByLabelText('Lead guest name'), { target: { value: 'Card Guest' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Credit / Debit' }));
    fireEvent.change(screen.getByLabelText(/Card number/), { target: { value: '4242424242424242' } });
    fireEvent.change(screen.getByLabelText('Cardholder name'), { target: { value: 'Card Guest' } });
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '0120' } });
    fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } });
    expect(screen.getByText('VISA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirm demo payment/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/unexpired/);
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '1299' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm demo payment/ }));await finishPayment();
    expect(localStorage.getItem(PASSES_KEY)).toBeNull();const sent=JSON.parse(fetch.mock.calls.find(([path,options])=>path==='/api/bookings'&&options.method==='POST')[1].body);expect(JSON.stringify(sent)).not.toContain('4242424242424242');expect(sent.payment.last4).toBe('4242');
  });
  it('keeps server-confirmed booking valid even when the browser offline cache is full', async () => {
    render(<App/>);await startPayment();
    fireEvent.change(screen.getByLabelText('Lead guest name'), { target: { value: 'Bank Guest' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Net banking' }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm demo payment/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/Choose your bank/);
    fireEvent.change(screen.getByLabelText('Search banks'), { target: { value: 'Canara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Canara Bank' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    fireEvent.click(screen.getByRole('button', { name: /Confirm demo payment/ }));await finishPayment();
    expect(screen.getByRole('heading', { name: 'Booking confirmed.' })).toBeTruthy();
    expect(screen.queryByText(/offline copy could not be saved/)).toBeNull();
    expect(localStorage.getItem(PASSES_KEY)).toBeNull();
  });
});
