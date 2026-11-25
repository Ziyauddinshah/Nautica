import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
import { boatDocumentTypes, fleetChecks } from '../domain/fleet.js';
export default function DocumentRenewals({
  boat,
  admin,
  onChanged
}) {
  const {
      t
    } = useI18n(),
    [checks, setChecks] = useState({}),
    [notes, setNotes] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = Object.values(boat.pendingDocuments || {}),
    base = (admin ? '/api/admin/fleet/' : '/api/owner/boats/') + boat.id;
  async function act(action) {
    setBusy(true);
    try {
      await request(base + '/renewals', {
        method: 'POST',
        body: {
          action,
          revision: boat.revision,
          checks,
          notes
        }
      });
      setChecks({});
      setNotes('');
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!pending.length && !boat.renewalReview) return null;
  return <section className="aftercare-panel"><h3>{t('Document renewals')}</h3>{pending.length > 0 && <><p>{t('Approved documents remain active while replacements await review. Expired approved documents still block new bookings.')}</p><ul>{pending.map(doc => <li key={doc.id}>{t(boatDocumentTypes.find(type => type.id === doc.category)?.label || doc.category)} · {doc.expiresOn || t('No expiry recorded')} · <a href={base + '/documents/' + doc.id}>{t('Download')}</a></li>)}</ul>{admin && <form onSubmit={event => {
        event.preventDefault();
        act('approve');
      }}>{fleetChecks.map(([key, label]) => <label className="fleet-check" key={key}><input type="checkbox" checked={Boolean(checks[key])} onChange={event => setChecks({
            ...checks,
            [key]: event.target.checked
          })} />{t(label)}</label>)}<label>{t('Renewal decision reason')}<textarea required minLength={10} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label><button disabled={busy || notes.trim().length < 10}>{t('Approve document renewals')}</button><button type="button" disabled={busy || notes.trim().length < 10} onClick={() => act('reject')}>{t('Reject document renewals')}</button></form>}</>}{boat.renewalReview && <p>{t('Last renewal decision')}: {t(boat.renewalReview.status)} · {boat.renewalReview.notes}</p>}{error && <p role="alert">{t(error)}</p>}</section>;
}
