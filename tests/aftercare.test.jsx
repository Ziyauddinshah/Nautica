/** @file Regression tests for aftercare behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CancellationControls from '../src/components/CancellationControls.jsx';
import RefundAdministration from '../src/components/RefundAdministration.jsx';
import DocumentReminders from '../src/components/DocumentReminders.jsx';
import DocumentRenewals from '../src/components/DocumentRenewals.jsx';
import BoardingPass from '../src/components/BoardingPass.jsx';
import { I18nProvider } from '../src/i18n/I18nProvider.jsx';
import { boats } from '../src/domain/booking.js';
import { fleetChecks } from '../src/domain/fleet.js';
const record = {
  id: 'NTC-012345ABCDEF',
  status: 'confirmed',
  boat: boats[0],
  trip: {
    date: '2027-02-01',
    slot: 'Sunrise cruise',
  },
  cancellation: {
    policy: {
      cutoffHours: 24,
    },
    revision: 1,
    deadline: '2027-01-31T00:00:00Z',
    canRequest: true,
  },
};
test('customer cancellation requires an explicit reason and policy acceptance and uses no client amount', async () => {
  const changed = vi.fn();
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      cancellation: {
        status: 'requested',
      },
    }),
  );
  render(<CancellationControls record={record} onChanged={changed} />);
  expect(screen.getByText(/at least 24 hours/)).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: 'Request cancellation',
    }).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: {
      value: 'Our travel plans have changed.',
    },
  });
  fireEvent.click(
    screen.getByLabelText(
      'I accept the cancellation policy and understand that approval is required.',
    ),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Request cancellation',
    }),
  );
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation request' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const [path, options] = fetch.mock.calls[0];
  expect(path).toBe('/api/user/bookings/' + record.id + '/cancellation');
  expect(JSON.parse(options.body)).toEqual({
    reason: 'Our travel plans have changed.',
    acceptPolicy: true,
  });
});
test('admin cancellation approval sends the current revision and a visible decision reason', async () => {
  const changed = vi.fn();
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      cancellation: {
        status: 'approved',
      },
    }),
  );
  render(
    <CancellationControls
      admin
      record={{
        ...record,
        cancellation: {
          ...record.cancellation,
          status: 'requested',
          revision: 3,
        },
      }}
      onChanged={changed}
    />,
  );
  fireEvent.change(screen.getByLabelText('Decision reason (visible to customer)'), {
    target: {
      value: 'Eligible request; full refund approved.',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Approve cancellation and full refund',
    }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    action: 'approve',
    revision: 3,
    reason: 'Eligible request; full refund approved.',
  });
});
test('refund administration shows unknown outcomes and sends explicit reconciliation without initiating new refunds', async () => {
  vi.mocked(fetch).mockImplementation(async (path, options = {}) =>
    path.endsWith('/reconcile')
      ? Response.json({
          refund: {
            status: 'pending',
          },
        })
      : Response.json({
          refunds: [
            {
              id: 'RF-test',
              status: 'unknown',
              amount: 126000,
              currency: 'INR',
              generation: 1,
            },
          ],
          total: 1,
        }),
  );
  render(<RefundAdministration />);
  await screen.findByText('Refund outcome unknown');
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Reconcile refund',
    }),
  );
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path === '/api/admin/refunds/RF-test/reconcile')).toBe(
      true,
    ),
  );
  expect(fetch.mock.calls.some(([path]) => path.endsWith('/retry'))).toBe(false);
});
test('owner reminder view exposes dates/statuses and offers no admin retry action', async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      documents: [
        {
          category: 'insurance',
          label: 'Passenger and third-party insurance',
          expiresOn: '2027-02-01',
          daysRemaining: 7,
          pendingRenewal: true,
        },
      ],
      notifications: [
        {
          audience: 'owner',
          channel: 'email',
          status: 'pending',
        },
      ],
    }),
  );
  render(<DocumentReminders boatId="BT-test" revision={1} />);
  await screen.findByText(/Renewal awaiting review/);
  expect(
    screen.queryByRole('button', {
      name: 'Retry failed reminders',
    }),
  ).toBeNull();
  expect(fetch.mock.calls[0][0]).toBe('/api/owner/boats/BT-test/reminders');
});
test('document renewal approval requires explicit review checks and keeps the original boat revision', async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      boat: {},
    }),
  );
  const changed = vi.fn(),
    boat = {
      id: 'BT-test',
      revision: 8,
      pendingDocuments: {
        insurance: {
          category: 'insurance',
          id: 'doc-1',
          expiresOn: '2028-01-01',
        },
      },
    };
  render(<DocumentRenewals admin boat={boat} onChanged={changed} />);
  for (const [key, label] of fleetChecks) fireEvent.click(screen.getByLabelText(label));
  fireEvent.change(screen.getByLabelText('Renewal decision reason'), {
    target: {
      value: 'Renewed certificate checked with issuer.',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Approve document renewals',
    }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body).revision).toBe(8);
});
test('cancelled passes never render a boarding QR or export controls', () => {
  render(
    <BoardingPass
      booking={{
        boatId: boats[0].id,
        boat: boats[0],
        bookingStatus: 'cancelled',
        seats: ['01'],
        extras: [],
        total: 126000,
      }}
      currency="INR"
      onExplore={() => {}}
    />,
  );
  expect(screen.getByRole('alert').textContent).toContain('Booking cancelled');
  expect(
    screen.queryByRole('button', {
      name: 'Download pass',
    }),
  ).toBeNull();
});
test('Hindi cancellation policy and refund status remain readable', () => {
  localStorage.setItem('nautica.language', 'hi');
  render(
    <I18nProvider>
      <CancellationControls
        record={{
          ...record,
          status: 'cancelled',
          cancellation: {
            ...record.cancellation,
            status: 'approved',
            refund: {
              id: 'RF-test',
              status: 'processed',
              amount: 126000,
            },
          },
        }}
      />
    </I18nProvider>,
  );
  expect(screen.getByText(/कम से कम 24 घंटे/)).toBeTruthy();
  expect(screen.getByText('धनवापसी पूर्ण हुई')).toBeTruthy();
});
test('customers can withdraw a pending request without approving a refund', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ cancellation: { status: 'withdrawn' } }));
  const changed = vi.fn();
  render(
    <CancellationControls
      record={{
        ...record,
        cancellation: {
          ...record.cancellation,
          status: 'requested',
          canRequest: false,
          revision: 2,
        },
      }}
      onChanged={changed}
    />,
  );
  expect(
    screen.getByText('Seats remain reserved; boarding is paused until review or withdrawal.'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw cancellation request' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'withdraw', revision: 2 });
});
