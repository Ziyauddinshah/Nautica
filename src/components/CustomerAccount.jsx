import { EmailVerificationNotice } from './EmailVerification.jsx';
/** @file React customer account view; authorization and authoritative state remain on the server. */
import UpcomingJourney from './UpcomingJourney.jsx';
import { refundStatusText } from '../lib/refundStatus.js';
import CancellationControls from './CancellationControls.jsx';
import { smsStatusText } from '../lib/smsStatus.js';
import useBackgroundRefresh from '../hooks/useBackgroundRefresh.js';
import LanguageSwitcher, { useI18n } from '../i18n/I18nProvider.jsx';
import { useEffect, useState } from 'react';
import { clearLegacyPassCache } from '../hooks/useCustomerSession.js';
import { request } from '../lib/api.js';
import { money } from '../domain/booking.js';
import { AuthForm } from './AuthForm.jsx';
import BookingDialog from './BookingDialog.jsx';
const paymentStatusText = (status) =>
  ({
    demo_paid: 'Demo payment recorded',
    paid: 'Paid',
    pending: 'Pending',
    failed: 'Failed',
    refunded: 'Refunded',
    refund_required: 'Refund required',
    refund_pending: 'Refund processing',
    refund_failed: 'Refund needs attention',
    refund_attention: 'Refund needs attention',
    demo_refunded: 'Demo refund recorded',
  })[status] || 'Status unavailable';
const emailStatusText = (status) =>
  ({
    pending: 'Queued',
    sending: 'Sending',
    sent: 'Sent',
    failed: 'Delivery delayed',
    verification_required: 'Verify your email to receive updates',
  })[status] || 'Not requested';
export default function CustomerAccount({ user, onUser, currency, onCurrency }) {
  const { t, locale } = useI18n();
  const backgroundRefresh = useBackgroundRefresh(Boolean(user));
  const [overview, setOverview] = useState({});
  const [next, setNext] = useState(null);

  const summary = overview.owner === user?.id ? overview : {};
  const [dataState, setData] = useState({
      bookings: [],
      total: 0,
    }),
    [offset, setOffset] = useState(0),
    [tab, setTab] = useState('bookings'),
    [selected, setSelected] = useState(null);
  const data = dataState.owner === user?.id ? dataState : { bookings: [], payments: [], total: 0 };
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [message, setMessage] = useState('');
  const [passwords, setPasswords] = useState({
      currentPassword: '',
      newPassword: '',
      confirmation: '',
    }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setData({ bookings: [], total: 0 });
    setSelected(null);
  }, [user?.id, offset, tab]);
  useEffect(() => {
    if (!user || tab === 'security') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(
      (tab === 'payments' ? '/api/user/payments?' : '/api/user/bookings?') +
        new URLSearchParams({
          offset,
          ...(['upcoming', 'past'].includes(tab) ? { view: tab } : {}),
        }),
      {
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setData({ ...result, owner: user.id });
          setOverview((previous) => ({
            ...(previous.owner === user.id ? previous : {}),
            ...result.counts,
            ...(tab === 'bookings' && !result.counts ? { all: result.total } : {}),
            ...(result.paymentTotal !== undefined ? { paymentTotal: result.paymentTotal } : {}),
            owner: user.id,
          }));
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setError(error.message);
          if (error.status === 401) onUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user?.id, offset, tab, refresh, backgroundRefresh]);
  useEffect(() => {
    if (!user) {
      setNext(null);
      return;
    }
    const controller = new AbortController();
    request('/api/user/next-journey', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setNext({ owner: user.id, record: result.journey || null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNext(null);
          if (error.status === 401) onUser(null);
        }
      });
    return () => controller.abort();
  }, [user?.id, refresh, backgroundRefresh]);
  async function logout() {
    setBusy(true);
    try {
      await request('/api/user/logout', {
        method: 'POST',
        body: {},
      });
      setSelected(null);
      setData({
        bookings: [],
        total: 0,
      });
      onUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event) {
    event.preventDefault();
    setError('');
    if (passwords.newPassword !== passwords.confirmation) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await request('/api/user/password', {
        method: 'POST',
        body: {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        },
      });
      setPasswords({
        currentPassword: '',
        newPassword: '',
        confirmation: '',
      });
      setData({
        bookings: [],
        total: 0,
      });
      setSelected(null);
      setMessage('Password updated. Sign in again with your new password.');
      onUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#account-content">
        {t('Skip to main content')}
      </a>
      <header className="header">
        <LanguageSwitcher />
        <a className="brand" href="/">
          {t('\u2693 Nautica')}
          <span className="brand-dot">.</span>
        </a>
        <nav>
          <a className="outline" href="/">
            {t('Explore boats')}
          </a>
          <button className="quiet" onClick={onCurrency} aria-label={t('Switch currency')}>
            {t(currency)} ⇄
          </button>
          {user && (
            <button className="quiet" disabled={busy} onClick={logout}>
              {t('Sign out')}
            </button>
          )}
        </nav>
      </header>
      <main className="account-main" id="account-content" tabIndex={-1}>
        {user === undefined ? (
          <p role="status">{t('Checking your session\u2026')}</p>
        ) : !user ? (
          <div className="account-login">
            <AuthForm
              onSuccess={(next) => {
                setMessage('');
                onUser(next);
              }}
              message={message}
            />
          </div>
        ) : (
          <>
            <p className="eyebrow">{t('YOUR ACCOUNT')}</p>
            <div className="section-head">
              <h1 className="admin-title">
                {t('Hello,')} {user.name}.
              </h1>
              <button className="outline" onClick={() => setRefresh((value) => value + 1)}>
                {t('Refresh history')}
              </button>
            </div>
            <section className="account-profile" aria-label={t('Your profile')}>
              <div>
                <small>{t('EMAIL')}</small>
                <strong>{user.email}</strong>
              </div>
              <div>
                <small>{t('PHONE')}</small>
                <strong>{user.phone}</strong>
              </div>
              <div>
                <small>{t('MEMBER SINCE')}</small>
                <strong>
                  {new Date(user.createdAt).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN')}
                </strong>
              </div>
              <div>
                <small>{t('YOUR BOOKINGS')}</small>
                <strong>{t(summary.all ?? '—')}</strong>
              </div>
            </section>
            {next?.owner === user.id && (
              <UpcomingJourney record={next.record} onPass={setSelected} />
            )}
            <EmailVerificationNotice user={user} />
            <div className="account-summary">
              {[
                ['upcoming', 'Upcoming journeys', summary.upcoming],
                ['past', 'Previous bookings', summary.past],
                ['payments', 'Payment history', summary.paymentTotal],
              ].map(([id, label, count]) => (
                <button
                  key={id}
                  className="outline"
                  onClick={() => {
                    setOffset(0);
                    setTab(id);
                  }}
                >
                  <span>{t(label)}</span> <strong>{count ?? '—'}</strong>
                </button>
              ))}
            </div>
            <div className="tabs" role="tablist" aria-label={t('Account sections')}>
              {[
                ['bookings', 'Booking history'],
                ['upcoming', 'Upcoming journeys'],
                ['past', 'Previous bookings'],
                ['payments', 'Payment history'],
                ['security', 'Account security'],
              ].map(([id, label], index, items) => (
                <button
                  key={id}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next =
                      items[
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? items.length - 1
                            : (index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) %
                              items.length
                      ][0];
                    setOffset(0);
                    setTab(next);
                    event.currentTarget.parentElement
                      .querySelectorAll('[role=tab]')
                      [items.findIndex(([id]) => id === next)]?.focus();
                  }}
                  className={`tab ${tab === id ? 'active' : ''}`}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setOffset(0);
                    setTab(id);
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {loading && <p role="status">{t('Loading your history\u2026')}</p>}
            {['bookings', 'upcoming', 'past'].includes(tab) && (
              <section>
                <h2>
                  {t(
                    tab === 'upcoming'
                      ? 'Upcoming journeys'
                      : tab === 'past'
                        ? 'Previous bookings'
                        : 'Booking history',
                  )}
                </h2>
                <p className="subtitle">
                  {t(
                    tab === 'upcoming'
                      ? 'Your next journeys, ordered by departure. Times are local to the boarding pier.'
                      : tab === 'past'
                        ? 'Your previous and cancelled bookings, most recent journey first.'
                        : 'Your reservations, trip details and boarding passes are listed here.',
                  )}
                </p>
                <div className="account-bookings">
                  {(data.bookings || []).map((record) => (
                    <article key={record.id} className="account-booking">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">{record.id}</p>
                          <h3>{t(record.boat.name)}</h3>
                        </div>
                        <span className="booking-status">
                          {t(record.journeyState === 'in_progress' ? 'In progress' : record.status)}
                        </span>
                      </div>
                      <p>
                        {t(record.boat.pier)}
                        <br />
                        {t(record.trip.date)} · {t(record.trip.slot)}
                        <br />
                        {t(record.trip.guests)} {t('guests \xB7 Seats')}{' '}
                        {t(record.trip.seats.join(', '))}
                      </p>
                      <div className="money-row">
                        <span>{t(paymentStatusText(record.payment.status))}</span>
                        <strong>{t(money(record.payment.amount, currency, locale))}</strong>
                      </div>
                      <small>
                        {t('Booked')}{' '}
                        {t(
                          new Date(record.createdAt).toLocaleString(
                            locale === 'hi' ? 'hi-IN' : 'en-IN',
                          ),
                        )}{' '}
                        {t('\xB7 Confirmation email:')}{' '}
                        {t(
                          emailStatusText(
                            record.notifications?.find(
                              (item) => item.audience === 'customer' && item.channel !== 'sms',
                            )?.status,
                          ),
                        )}
                      </small>
                      {record.notifications?.some((item) => item.channel === 'sms') && (
                        <small className="sms-status">
                          {t('Confirmation SMS:')}{' '}
                          {t(
                            smsStatusText(
                              record.notifications.find((item) => item.channel === 'sms').status,
                            ),
                          )}
                        </small>
                      )}
                      <button
                        className="primary wide"
                        disabled={!record.pass || record.status === 'cancelled'}
                        onClick={() => setSelected(record.pass)}
                      >
                        {t('View boarding pass')}
                      </button>
                      <CancellationControls
                        record={record}
                        onChanged={() => {
                          setSelected(null);
                          setRefresh((v) => v + 1);
                        }}
                      />
                    </article>
                  ))}
                </div>
                {!loading && !(data.bookings || []).length && (
                  <p className="empty">
                    {t(
                      tab === 'upcoming'
                        ? 'No upcoming journeys. Explore boats to plan your next trip.'
                        : tab === 'past'
                          ? 'No previous bookings yet.'
                          : 'No bookings yet. Choose a boat to plan your first trip.',
                    )}
                  </p>
                )}
              </section>
            )}
            {tab === 'payments' && (
              <section>
                <h2>{t('Payment history')}</h2>
                <p className="subtitle">
                  {t(
                    'Booking payments and unfinished payment attempts are listed here. Amounts are in INR. Demo payments are not real charges.',
                  )}
                </p>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <caption>{t('Your payment records')}</caption>
                    <thead>
                      <tr>
                        {[
                          'Booking',
                          'Vessel',
                          'Method',
                          'Status',
                          'Amount',
                          'Reference / date',
                        ].map((title) => (
                          <th key={title} scope="col">
                            {t(title)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.payments || []).map((payment) => (
                        <tr key={payment.source + ':' + payment.id}>
                          <td>
                            {payment.bookingId || t('No confirmed booking')}
                            <small>
                              {payment.trip?.date} · {t(payment.trip?.slot || '')}
                            </small>
                          </td>
                          <td>
                            {t(payment.boat?.name || 'Status unavailable')}
                            <small>{t(payment.boat?.pier || '')}</small>
                          </td>
                          <td>{t(payment.method)}</td>
                          <td>
                            {t(paymentStatusText(payment.status))}
                            {payment.status === 'refund_required' && (
                              <small>{t('Contact support for a refund.')}</small>
                            )}
                          </td>
                          <td>{money(payment.amount, 'INR', locale)}</td>
                          <td>
                            {payment.reference || t('Awaiting reference')}
                            {payment.refund && (
                              <small>
                                {t('Refund reference')}:{' '}
                                {payment.refund.providerRefundId || payment.refund.id} ·{' '}
                                {t(refundStatusText(payment.refund.status))}
                                {payment.refund.bankReference
                                  ? ' · ' + payment.refund.bankReference
                                  : ''}
                              </small>
                            )}
                            <small>
                              {payment.createdAt
                                ? new Date(payment.createdAt).toLocaleString(
                                    locale === 'hi' ? 'hi-IN' : 'en-IN',
                                  )
                                : t('Date unavailable')}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!loading && !(data.payments || []).length && (
                  <p className="empty">{t('No payment records yet.')}</p>
                )}
              </section>
            )}
            {tab === 'security' && (
              <section className="account-security">
                <h2>{t('Change password')}</h2>
                <p className="subtitle">
                  {t('Changing your password signs out all devices, including this session.')}
                </p>
                <form onSubmit={changePassword}>
                  <label className="field">
                    {t('Current password')}
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={256}
                      value={passwords.currentPassword}
                      onChange={(event) =>
                        setPasswords({
                          ...passwords,
                          currentPassword: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    {t('New password')}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={256}
                      value={passwords.newPassword}
                      onChange={(event) =>
                        setPasswords({
                          ...passwords,
                          newPassword: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    {t('Confirm new password')}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={256}
                      value={passwords.confirmation}
                      onChange={(event) =>
                        setPasswords({
                          ...passwords,
                          confirmation: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button className="primary" type="submit" disabled={busy}>
                    {t('Change password and sign out')}
                  </button>
                </form>
                <hr />
                <h3>{t('Older browser pass copies')}</h3>
                <p className="subtitle">
                  {t(
                    'You can remove older pass copies saved on this device. Your account bookings will remain available.',
                  )}
                </p>
                <button
                  className="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Remove older pass copies saved on this device? Your account bookings will remain available.',
                      )
                    )
                      setMessage(
                        clearLegacyPassCache()
                          ? 'Old browser pass copies cleared.'
                          : 'Browser storage could not be cleared.',
                      );
                  }}
                >
                  {t('Clear old browser pass copies')}
                </button>
              </section>
            )}
            {tab !== 'security' && (
              <div className="admin-pagination">
                <button
                  className="outline"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((value) => Math.max(0, value - 50))}
                >
                  {t('Previous')}
                </button>
                <span>
                  {t('Page')} {t(Math.floor(offset / 50) + 1)} · {data.total}{' '}
                  {t(tab === 'payments' ? 'payment records' : 'bookings')}
                </span>
                <button
                  className="outline"
                  disabled={offset + 50 >= data.total || loading}
                  onClick={() => setOffset((value) => value + 50)}
                >
                  {t('Next')}
                </button>
              </div>
            )}
          </>
        )}
        {user && message && (
          <p className="demo-note" role="status">
            {t(message)}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
      </main>
      {selected && user && (
        <BookingDialog
          flow={{
            kind: 'pass',
            booking: selected,
          }}
          passes={(data.bookings || []).map((record) => record.pass)}
          currency={currency}
          onCurrency={onCurrency}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
