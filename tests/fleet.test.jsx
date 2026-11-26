/** @file Regression tests for fleet behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FleetPortal from '../src/components/FleetPortal.jsx';
import App from '../src/App.jsx';
import { boats } from '../src/domain/booking.js';
import { fleetChecks, boatDocumentTypes } from '../src/domain/fleet.js';
import { I18nProvider } from '../src/i18n/I18nProvider.jsx';
const user = {
  id: 'owner',
  name: 'Owner',
  email: 'owner@example.test',
};
const json = (data, status = 200) =>
  new Response(
    JSON.stringify(
      data.boats
        ? {
            ...data,
            mobileVerified: true,
            identityVerified: true,
            mobileEnabled: true,
            identityEnabled: true,
          }
        : data,
    ),
    {
      status,
    },
  );
const details = {
  ...boats[0],
  operatorName: 'Owner',
  registrationNumber: 'UP-123',
  registrationAuthority: 'Authority',
  propulsion: 'manual',
  lifeJackets: 7,
  description: 'Real boat registered for passenger journeys.',
  boardingInstructions: 'Meet at the Assi Ghat boarding point.',
  captainIncluded: true,
};
const draft = {
  id: 'BT-0123456789ABCDEF',
  ownerId: 'owner',
  status: 'draft',
  revision: 1,
  details,
  documents: {},
};
test('public catalogue fails closed and never displays sample boats after an API error', async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    path === '/api/boats'
      ? json(
          {
            error: 'Unavailable',
          },
          503,
        )
      : path === '/api/user/session'
        ? json(
            {
              error: 'Sign in',
            },
            401,
          )
        : json({
            bookings: [],
          }),
  );
  render(<App />);
  await screen.findByText('Unable to load boats.');
  expect(
    screen.queryByRole('button', {
      name: 'Choose seats on Ganges Dawn',
    }),
  ).toBeNull();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
});
test('owner sees their boat, private document checklist and generated seating but cannot approve it', async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    path.includes('BT-')
      ? json({
          boat: draft,
        })
      : json({
          boats: [draft],
          total: 1,
        }),
  );
  render(<FleetPortal user={user} onUser={() => {}} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Ganges Dawn.*draft/,
    }),
  );
  await screen.findByText('Private documents');
  for (const type of boatDocumentTypes)
    expect(
      screen.getAllByText(new RegExp(type.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length,
    ).toBeGreaterThan(0);
  expect(screen.getByText('06')).toBeTruthy();
  expect(
    screen.queryByRole('button', {
      name: 'Approve vessel',
    }),
  ).toBeNull();
  expect(
    screen.getByRole('button', {
      name: 'Submit for admin review',
    }).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByLabelText(
      'I am authorized to operate this boat. Details and documents are authentic, current and match the actual boat.',
    ),
  );
  expect(
    screen.getByRole('button', {
      name: 'Submit for admin review',
    }).disabled,
  ).toBe(false);
});
test('admin review sends explicit independent checks and current revision', async () => {
  const pending = {
    ...draft,
    status: 'pending',
    createdBy: 'owner:owner',
    revision: 9,
  };
  let review;
  vi.mocked(fetch).mockImplementation(async (path, options = {}) => {
    if (path === '/api/admin/session')
      return json({
        username: 'reviewer',
      });
    if (path.endsWith('/review')) {
      review = JSON.parse(options.body);
      return json({
        boat: {
          ...pending,
          status: 'approved',
          revision: 10,
        },
      });
    }
    return path.includes('BT-')
      ? json({
          boat: pending,
        })
      : json({
          boats: [pending],
          total: 1,
        });
  });
  render(<FleetPortal admin />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Ganges Dawn.*pending/,
    }),
  );
  await screen.findByText('Authority verification');
  for (const [key, label] of fleetChecks) fireEvent.click(screen.getByLabelText(label));
  fireEvent.change(screen.getByLabelText('Review notes / verified authority references'), {
    target: {
      value: 'Original certificates and authority records verified.',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Approve vessel',
    }),
  );
  await waitFor(() => expect(review?.revision).toBe(9));
  expect(review.action).toBe('approve');
  for (const [key] of fleetChecks) expect(review.checks[key]).toBe(true);
});
test('Hindi registration screen translates document categories and review controls', async () => {
  localStorage.setItem('nautica.language', 'hi');
  vi.mocked(fetch).mockResolvedValue(
    json({
      boats: [],
      total: 0,
    }),
  );
  render(
    <I18nProvider>
      <FleetPortal user={user} onUser={() => {}} />
    </I18nProvider>,
  );
  await screen.findByText('अभी कोई नाव पंजीकृत नहीं है।');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'नाव जोड़ें' }).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'नाव जोड़ें' }));
  expect(screen.getByLabelText('पंजीकरण संख्या')).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'प्रारूप बनाएँ',
    }),
  ).toBeTruthy();
});
