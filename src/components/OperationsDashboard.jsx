import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import LanguageSwitcher from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
import useBackgroundRefresh from '../hooks/useBackgroundRefresh.js';
import AdminSignIn from './AdminSignIn.jsx';
import { conditions } from '../domain/operations.js';
export default function OperationsDashboard() {
  const {
      t,
      locale
    } = useI18n(),
    [session, setSession] = useState(undefined),
    [data, setData] = useState({
      alerts: [],
      total: 0,
      instances: []
    }),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState('active'),
    [refresh, setRefresh] = useState(0),
    [history, setHistory] = useState([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const background = useBackgroundRefresh(Boolean(session));
  useEffect(() => {
    request('/api/admin/session').then(setSession).catch(() => setSession(null));
  }, []);
  useEffect(() => {
    setData({
      alerts: [],
      total: 0,
      instances: []
    });
    setHistory([]);
    if (!session) return;
    const controller = new AbortController();
    request('/api/admin/operations?' + new URLSearchParams({
      status,
      offset
    }), {
      signal: controller.signal
    }).then(setData).catch(e => {
      if (e.name !== 'AbortError') {
        setError(e.message);
        if (e.status === 401) setSession(null);
      }
    });
    return () => controller.abort();
  }, [session, status, offset, refresh, background]);
  async function acknowledge(row) {
    setBusy(true);
    setError('');
    try {
      await request('/api/admin/operations/' + row._id + '/acknowledge', {
        method: 'POST',
        body: {
          revision: row.revision
        }
      });
      setRefresh(v => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <><header className="header"><a className="brand" href="/">⚓ Nautica.</a><LanguageSwitcher /><a href="/admin">{t('Booking administration')}</a></header><main className="admin-main"><h1>{t('Operational alerts')}</h1>{session === undefined ? <p role="status">{t('Loading…')}</p> : !session ? <AdminSignIn onSuccess={setSession} /> : <><p>{t('Acknowledging an incident records ownership; only a healthy check resolves it. Alert messages exclude credentials and customer details.')}</p><label>{t('Incident filter')}<select value={status} onChange={e => {
            setOffset(0);
            setStatus(e.target.value);
          }}><option value="active">{t('Active incidents')}</option><option value="all">{t('All incidents')}</option></select></label><button onClick={() => setRefresh(v => v + 1)}>{t('Refresh alerts')}</button><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await request('/api/admin/operations/delivery/retry',{method:'POST',body:{}});setRefresh(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}}}>{t('Retry failed alert delivery')}</button><p>{t('Review delivery status before retrying. Accepted or uncertain SMS messages are not resent.')}</p><p>{data.total} {t('incidents')}</p>{data.alerts.map(row => <article className="aftercare-panel" key={row._id}><h2>{t(conditions[row.code]?.title || 'Operational incident')}</h2><p>{t(conditions[row.code]?.body || '')}</p><p>{t(row.severity)} · {t(row.status)} · {t('Affected records')}: {row.count}</p><p>{t('Last observed')}: {new Date(row.lastSeen).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')}</p>{row.source && <p>{t('App instance')}: {row.source}</p>}{row.acknowledgedBy && <p>{t('Acknowledged by')}: {row.acknowledgedBy}</p>}{row.status === 'open' && <button disabled={busy} onClick={() => acknowledge(row)}>{t('Acknowledge incident')}</button>}<button onClick={() => request('/api/admin/operations/' + row._id + '/history').then(result => setHistory(result.events)).catch(e => setError(e.message))}>{t('View incident history')}</button></article>)}{data.alerts.length === 0 && <p>{t('No incidents match this filter.')}</p>}<button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('Previous')}</button><button disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>{t('Next')}</button><h2>{t('Reporting app instances')}</h2><ul>{data.instances.map(instance => <li key={instance._id}>{instance._id} · {new Date(instance.lastSeen).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')}{+new Date(instance.lastSeen) < Date.now() - 300000 && <button disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await request('/api/admin/operations/instances/' + instance._id + '/retire', {
                  method: 'POST',
                  body: {
                    lastSeen: instance.lastSeen
                  }
                });
                setRefresh(v => v + 1);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}>{t('Retire stopped instance')}</button>}</li>)}</ul>{history.length > 0 && <section><h2>{t('Incident history')}</h2><ul>{history.map((event, index) => <li key={index}>{new Date(event.at).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')} · {t(event.action)} · {event.actor || ''}</li>)}</ul></section>}</>}{error && <p role="alert">{t(error)}</p>}</main></>;
}
