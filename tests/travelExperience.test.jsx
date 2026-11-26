/** @file Journey shortcuts, cancellation confirmation, listing privacy and keyboard access. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UpcomingJourney from '../src/components/UpcomingJourney.jsx';
import BoatDetails, { BoatPhoto } from '../src/components/BoatDetails.jsx';
import CancellationControls from '../src/components/CancellationControls.jsx';
import SeatMap from '../src/components/SeatMap.jsx';
import { I18nProvider } from '../src/i18n/I18nProvider.jsx';
import { boats, slots } from '../src/domain/booking.js';
const record = {
  id: 'PRIVATE_BOOKING_ID',
  status: 'confirmed',
  boat: {
    ...boats[0],
    boardingInstructions: 'Meet the captain at the marked jetty',
    timeZone: 'Asia/Kolkata',
  },
  trip: { seats: ['01'], date: '2050-01-03', slot: slots[0] },
  departureAt: '2050-01-03T00:00:00Z',
  pass: { id: 'pass' },
  cancellation: {
    canRequest: true,
    estimatedRefund: 126000,
    policy: { cutoffHours: 24 },
    deadline: '2050-01-02T00:00:00Z',
  },
};
test('next journey shows seats, pier-local time and an opt-in map link without booking information', () => {
  const pass = vi.fn();
  render(<UpcomingJourney record={record} onPass={pass} />);
  expect(screen.getByText(/Meet the captain/)).toBeTruthy();
  const link = screen.getByRole('link', { name: /Directions to boarding pier/ });
  expect(link.getAttribute('href')).not.toContain('PRIVATE_BOOKING_ID');
  expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
  fireEvent.click(screen.getByRole('button', { name: 'Open journey boarding pass' }));
  expect(pass).toHaveBeenCalledWith(record.pass);
});
test('cancellation preview requires a separate confirmation and keeping a booking sends no request', () => {
  render(<CancellationControls record={record} />);
  expect(screen.getByText('₹1,260.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: { value: 'Our travel plans have changed.' },
  });
  fireEvent.click(
    screen.getByLabelText(
      'I accept the cancellation policy and understand that approval is required.',
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
  expect(screen.getByRole('button', { name: 'Confirm cancellation request' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep my booking' }));
  expect(screen.queryByRole('button', { name: 'Confirm cancellation request' })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
test('public details do not invent accessibility and never load remote tracking photos', () => {
  render(
    <>
      <BoatDetails boat={boats[0]} />
      <BoatPhoto
        boat={{ ...boats[0], photoUrl: 'https://tracker.example/pixel' }}
        fallback={<span>Illustrative boat</span>}
      />
    </>,
  );
  expect(screen.getByText(/Accessibility information has not been supplied/)).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Illustrative boat')).toBeTruthy();
});
test('arrow navigation skips held seats and Hindi labels remain meaningful', () => {
  localStorage.setItem('nautica.language', 'hi');
  render(
    <I18nProvider>
      <SeatMap boat={boats[0]} guests={1} selected={[]} held={['02']} onChange={vi.fn()} />
    </I18nProvider>,
  );
  const buttons = screen
    .getAllByRole('button')
    .filter((button) => button.classList.contains('seat-button'));
  buttons[0].focus();
  fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
  expect(document.activeElement).toBe(buttons[2]);
  expect(screen.getByText('अस्थायी रूप से रोकी गई')).toBeTruthy();
  expect(buttons[2].getAttribute('aria-label')).toBeTruthy();
});

test('Hindi listing content uses reviewed Hindi text instead of inventing a translation', () => {
  localStorage.setItem('nautica.language', 'hi');
  render(
    <I18nProvider>
      <BoatDetails
        boat={{
          ...boats[0],
          description: 'Owner English description',
          descriptionHi: 'समीक्षित नाव का हिन्दी विवरण',
          accessibilityNotesHi: 'कृपया चढ़ने में सहायता की पुष्टि करें।',
        }}
      />
    </I18nProvider>,
  );
  expect(screen.getByText('समीक्षित नाव का हिन्दी विवरण')).toBeTruthy();
  expect(screen.getByText('कृपया चढ़ने में सहायता की पुष्टि करें।')).toBeTruthy();
  expect(screen.queryByText('Owner English description')).toBeNull();
});
