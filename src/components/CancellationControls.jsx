/** @file React cancellation controls view; authorization and authoritative state remain on the server. */
import { refundStatusText } from '../lib/refundStatus.js';
import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
import { money } from '../domain/booking.js';
export default function CancellationControls({ record, admin = false, onChanged }) {
  const { t, locale } = useI18n(),
    [text, setText] = useState(''),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [boarding, setBoarding] = useState(null);
  const info = record.cancellation;
  if (!info) return null;
  const refund = info.refund;
  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await request(`/api/${admin ? 'admin' : 'user'}/bookings/${record.id}/cancellation`, {
        method: 'POST',
        body: admin
          ? {
              action,
              reason: text,
              revision: info.revision,
            }
          : action === 'withdraw'
            ? {
                action: 'withdraw',
                revision: info.revision,
              }
            : {
                reason: text,
                acceptPolicy: accepted,
              },
      });
      setText('');
      setAccepted(false);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="aftercare-panel" aria-label={t('Cancellation and refund')}>
      <h3>{t('Cancellation and refund')}</h3>
      <p>
        {t('Submitting a cancellation request pauses boarding until it is reviewed or withdrawn.')}
      </p>
      <p>
        {t(
          'Full refund for eligible requests at least {{hours}} hours before departure, subject to admin approval.',
          {
            hours: info.policy.cutoffHours,
          },
        )}
      </p>
      {info.deadline && (
        <p>
          {t('Cancellation deadline')}:{' '}
          {new Date(info.deadline).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
            timeZone: record.boat.timeZone || 'Asia/Kolkata',
          })}{' '}
          ({t('Local time at boarding pier')})
        </p>
      )}
      {info.status && (
        <p>
          {t('Cancellation status')}: <strong>{t(info.status)}</strong>
        </p>
      )}
      {info.status === 'requested' && (
        <p>{t('Seats remain reserved; boarding is paused until review or withdrawal.')}</p>
      )}
      {!admin && info.status === 'requested' && (
        <button disabled={busy} onClick={() => act('withdraw')}>
          {t('Withdraw cancellation request')}
        </button>
      )}
      {info.decisionReason && (
        <p>
          {t('Decision reason')}: {info.decisionReason}
        </p>
      )}
      {refund && (
        <div>
          <p>
            {t('Refund status')}: <strong>{t(refundStatusText(refund.status))}</strong> ·{' '}
            {money(refund.amount, 'INR', locale)}
          </p>
          <p>
            {t('Refund reference')}: {refund.providerRefundId || refund.id}
          </p>
          {refund.status === 'processed' && (
            <p>
              {t('Razorpay has processed the refund. Bank credit may take several working days.')}
            </p>
          )}
          {refund.bankReference && (
            <p>
              {t('Bank refund reference')}: {refund.bankReference}
            </p>
          )}
          {refund.status !== 'simulated' && (
            <p>
              {t(
                'Refund approval is not proof of money returned. The status updates after provider confirmation.',
              )}
            </p>
          )}
        </div>
      )}
      {record.status === 'confirmed' && (admin || info.canRequest) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            act(admin ? (info.status === 'requested' ? 'approve' : 'cancel') : 'request');
          }}
        >
          <label>
            {t(admin ? 'Decision reason (visible to customer)' : 'Cancellation reason')}
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {!admin && (
            <label className="fleet-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              {t('I accept the cancellation policy and understand that approval is required.')}
            </label>
          )}
          <button
            className="outline"
            disabled={busy || text.trim().length < 10 || (!admin && !accepted)}
          >
            {t(
              admin
                ? info.status === 'requested'
                  ? 'Approve cancellation and full refund'
                  : 'Cancel booking and approve full refund'
                : 'Request cancellation',
            )}
          </button>
          {admin && info.status === 'requested' && (
            <button
              type="button"
              disabled={busy || text.trim().length < 10}
              onClick={() => act('reject')}
            >
              {t('Decline cancellation')}
            </button>
          )}
        </form>
      )}
      {!admin &&
        record.status === 'confirmed' &&
        !info.canRequest &&
        info.status !== 'requested' && (
          <p>
            {t(
              'Online cancellation is unavailable after the deadline. Contact support for exceptional cases.',
            )}
          </p>
        )}
      {admin && (
        <>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await request('/api/admin/boarding/verify', {
                  method: 'POST',
                  body: {
                    bookingId: record.id,
                    boatId: record.boat.id,
                    date: record.trip.date,
                    slot: record.trip.slot,
                  },
                });
                setBoarding(result.valid);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Check boarding validity')}
          </button>
          {boarding !== null && (
            <p role="status">
              {t(
                boarding
                  ? 'Boarding permitted'
                  : 'Boarding is not permitted now. Check booking, payment, vessel and departure time.',
              )}
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
