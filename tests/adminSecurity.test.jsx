/** @file Regression tests for admin security behavior using isolated fixtures. */
import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSignIn from '../src/components/AdminSignIn.jsx';
import AdminSecurity from '../src/components/AdminSecurity.jsx';
import OperationsDashboard from '../src/components/OperationsDashboard.jsx';
const json = (data) => Response.json(data);
test('admin sign in waits for authenticator verification before granting access', async () => {
  const success = vi.fn();
  vi.mocked(fetch).mockImplementation(async (path) =>
    path === '/api/admin/login'
      ? json({
          mfaRequired: true,
          enrollmentRequired: false,
        })
      : json({
          username: 'admin',
        }),
  );
  render(<AdminSignIn onSuccess={success} />);
  fireEvent.change(screen.getByLabelText('Admin username'), {
    target: {
      value: 'admin',
    },
  });
  fireEvent.change(screen.getByLabelText('Admin password'), {
    target: {
      value: 'strong-admin-password',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Sign in as admin',
    }),
  );
  await screen.findByLabelText('Authenticator or recovery code');
  expect(success).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Authenticator or recovery code'), {
    target: {
      value: '123456',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Verify admin sign in',
    }),
  );
  await waitFor(() =>
    expect(success).toHaveBeenCalledWith({
      username: 'admin',
    }),
  );
  expect(localStorage.length).toBe(0);
});
test('new enrollment displays only locally generated QR and one-time recovery codes until acknowledged', async () => {
  const success = vi.fn();
  vi.mocked(fetch).mockImplementation(async (path) =>
    path === '/api/admin/login'
      ? json({
          mfaRequired: true,
          enrollmentRequired: true,
        })
      : path.endsWith('/setup')
        ? json({
            secret: 'PRIVATE_SETUP_KEY',
            uri: 'otpauth://totp/Nautica:admin?secret=PRIVATE_SETUP_KEY',
          })
        : json({
            username: 'admin',
            recoveryCodes: ['PRIVATE_RECOVERY_1', 'PRIVATE_RECOVERY_2'],
          }),
  );
  render(<AdminSignIn onSuccess={success} />);
  fireEvent.change(screen.getByLabelText('Admin username'), {
    target: {
      value: 'admin',
    },
  });
  fireEvent.change(screen.getByLabelText('Admin password'), {
    target: {
      value: 'strong-admin-password',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Sign in as admin',
    }),
  );
  await screen.findByRole('img', {
    name: 'Authenticator setup QR code',
  });
  fireEvent.change(screen.getByLabelText('Authenticator code'), {
    target: {
      value: '123456',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Verify admin sign in',
    }),
  );
  await screen.findByText('PRIVATE_RECOVERY_1');
  expect(success).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  fireEvent.click(
    screen.getByRole('button', {
      name: 'I saved my recovery codes',
    }),
  );
  expect(success).toHaveBeenCalledWith({
    username: 'admin',
  });
});
test('rotating recovery codes requires the admin password and a fresh factor', async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    path.endsWith('/recovery')
      ? json({
          recoveryCodes: ['NEW_PRIVATE_CODE'],
        })
      : json({
          enabled: true,
          recoveryCodesRemaining: 6,
        }),
  );
  render(<AdminSecurity />);
  await screen.findByText(/Unused recovery codes/);
  fireEvent.change(screen.getByLabelText('Admin password'), {
    target: {
      value: 'admin-password',
    },
  });
  fireEvent.change(screen.getByLabelText('Fresh authenticator or recovery code'), {
    target: {
      value: '654321',
    },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Replace recovery codes',
    }),
  );
  await screen.findByText('NEW_PRIVATE_CODE');
  const request = fetch.mock.calls.find(([path]) => path.endsWith('/recovery'));
  expect(JSON.parse(request[1].body)).toEqual({
    password: 'admin-password',
    code: '654321',
  });
  expect(localStorage.length).toBe(0);
});
test('operations dashboard acknowledges an incident using its current revision', async () => {
  vi.mocked(fetch).mockImplementation(async (path) =>
    path === '/api/admin/session'
      ? json({
          username: 'admin',
        })
      : path.endsWith('/acknowledge')
        ? json({
            alert: {
              status: 'acknowledged',
            },
          })
        : json({
            alerts: [
              {
                _id: 'payment_attention',
                code: 'payment_attention',
                status: 'open',
                severity: 'critical',
                count: 2,
                revision: 4,
                lastSeen: '2026-11-25T01:00:00Z',
              },
            ],
            instances: [],
            total: 1,
          }),
  );
  render(<OperationsDashboard />);
  await screen.findByText('Payments require reconciliation');
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Acknowledge incident',
    }),
  );
  await waitFor(() =>
    expect(fetch.mock.calls.some(([path]) => path.endsWith('/acknowledge'))).toBe(true),
  );
  const call = fetch.mock.calls.find(([path]) => path.endsWith('/acknowledge'));
  expect(JSON.parse(call[1].body)).toEqual({
    revision: 4,
  });
});
