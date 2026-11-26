/** @file React document reminders view; authorization and authoritative state remain on the server. */
import { smsStatusText } from '../lib/smsStatus.js';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
export default function DocumentReminders({ boatId, revision, admin = false }) {
  const { t } = useI18n(),
    [data, setData] = useState({
      documents: [],
      notifications: [],
    }),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const path = (admin ? '/api/admin/fleet/' : '/api/owner/boats/') + boatId + '/reminders';
  useEffect(() => {
    const controller = new AbortController();
    request(path, {
      signal: controller.signal,
    })
      .then((result) => {
        setData({
          documents: result.documents || [],
          notifications: result.notifications || [],
        });
        setError('');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [path, revision, refresh]);
  async function retry() {
    setBusy(true);
    try {
      await request(path + '/retry', {
        method: 'POST',
        body: {},
      });
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="aftercare-panel">
      <h3>{t('Document expiry reminders')}</h3>
      <p>
        {t(
          'Owners and admins receive reminders at 30, 14, 7 and 1 days, on expiry day and once after expiry. Renewed documents require admin review.',
        )}
      </p>
      {data.documents.map((doc) => (
        <p key={doc.category}>
          {t(doc.label)} · {doc.expiresOn} ·{' '}
          {t(
            doc.daysRemaining < 0
              ? 'Expired'
              : doc.daysRemaining === 0
                ? 'Expires today'
                : 'Days remaining',
          )}
          {doc.daysRemaining > 0 ? ' ' + doc.daysRemaining : ''}
          {doc.pendingRenewal ? ' · ' + t('Renewal awaiting review') : ''}
        </p>
      ))}
      {!data.documents.length && <p>{t('No dated documents uploaded.')}</p>}
      <button onClick={() => setRefresh((v) => v + 1)}>{t('Refresh reminders')}</button>
      {admin && (
        <button disabled={busy} onClick={retry}>
          {t('Retry failed reminders')}
        </button>
      )}
      <ul>
        {data.notifications.map((notice, index) => (
          <li key={index}>
            {t(notice.audience)} · {t(notice.channel)} ·{' '}
            {t(
              notice.status === 'suppressed'
                ? 'suppressed'
                : notice.channel === 'sms'
                  ? smsStatusText(notice.status)
                  : {
                      pending: 'Queued',
                      sending: 'Sending',
                      sent: 'Sent',
                      failed: 'Delivery delayed',
                    }[notice.status] || notice.status,
            )}{' '}
            · {notice.notice?.document?.expiresOn}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
