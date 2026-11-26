/** @file React refund administration view; authorization and authoritative state remain on the server. */
import { refundStatusText, financialActionText } from '../lib/refundStatus.js';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
import { money } from '../domain/booking.js';
export default function RefundAdministration({ attention = [], refresh = 0, onChanged }) {
  const { t, locale } = useI18n(),
    [audit, setAudit] = useState([]),
    [data, setData] = useState({
      refunds: [],
      total: 0,
    }),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [reason, setReason] = useState(''),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    request('/api/admin/refunds?offset=' + offset, {
      signal: controller.signal,
    })
      .then((result) => {
        setData({
          refunds: result.refunds || [],
          total: result.total || 0,
          providerConfigured: result.providerConfigured,
        });
        setError('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [offset, revision, refresh]);
  async function act(path, body) {
    setBusy(true);
    setError('');
    try {
      await request(path, {
        method: 'POST',
        body,
      });
      setReason('');
      setReference('');
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-detail aftercare-panel">
      <h2>{t('Refund administration')}</h2>
      {data.providerConfigured === false && (
        <p>
          {t(
            'Online refund service is unavailable. Real approved refunds remain queued; contact your system administrator.',
          )}
        </p>
      )}
      <p>
        {t('Only provider-confirmed refunds are marked processed. Demo refunds do not move money.')}
      </p>
      <label>
        {t('Refund review reason')}
        <textarea
          value={reason}
          minLength={10}
          maxLength={1000}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        {t('Existing Razorpay refund reference (optional)')}
        <input
          value={reference}
          maxLength={110}
          placeholder="rfnd_…"
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      {attention.map((payment) => (
        <div key={payment.id}>
          <p>
            {t('Unbooked payment requiring refund')}: {payment.paymentId} · {payment.name} ·{' '}
            {money(payment.amount, 'INR', locale)}
          </p>
          <button
            disabled={busy || reason.trim().length < 10}
            onClick={() =>
              act('/api/admin/payments/' + encodeURIComponent(payment.id) + '/refund', {
                reason,
              })
            }
          >
            {t('Approve refund for unbooked payment')}
          </button>
        </div>
      ))}
      <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
        {t('Refresh refunds')}
      </button>
      <div className="admin-table-wrap">
        <table>
          <caption>{t('Refund history')}</caption>
          <thead>
            <tr>
              {[
                'Refund reference',
                'Booking',
                'Refund amount',
                'Refund status',
                'Provider reference',
                'Actions',
              ].map((label) => (
                <th key={label}>{t(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.refunds.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.bookingId || t('No booking')}</td>
                <td>{money(row.amount, 'INR', locale)}</td>
                <td>{t(refundStatusText(row.status))}</td>
                <td>
                  {row.providerRefundId || '—'}
                  {row.bankReference && <small>{row.bankReference}</small>}
                </td>
                <td>
                  {row.status !== 'simulated' && (
                    <>
                      <button
                        disabled={busy || (Boolean(reference) && reason.trim().length < 10)}
                        onClick={() =>
                          act(`/api/admin/refunds/${row.id}/reconcile`, {
                            reason,
                            ...(reference
                              ? {
                                  providerRefundId: reference,
                                }
                              : {}),
                          })
                        }
                      >
                        {t(
                          row.status === 'processed'
                            ? 'Refresh bank reference'
                            : 'Reconcile refund',
                        )}
                      </button>
                      {['unknown', 'failed', 'manual_review'].includes(row.status) && (
                        <button
                          disabled={busy || reason.trim().length < 10}
                          onClick={() =>
                            act(`/api/admin/refunds/${row.id}/retry`, {
                              reason,
                            })
                          }
                        >
                          {t('Retry refund after review')}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => {
                      request('/api/admin/refunds/' + row.id + '/audit')
                        .then((result) => setAudit(result.audit))
                        .catch((e) => setError(e.message));
                    }}
                  >
                    {t('View refund audit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - 50))}>
        {t('Previous')}
      </button>
      <button disabled={offset + 50 >= data.total || busy} onClick={() => setOffset(offset + 50)}>
        {t('Next')}
      </button>
      {audit.length > 0 && (
        <section>
          <h3>{t('Financial audit')}</h3>
          <ul>
            {audit.map((event, index) => (
              <li key={index}>
                {event.at} · {event.actor} · {t(financialActionText(event.action))}{' '}
                {event.reason || ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
