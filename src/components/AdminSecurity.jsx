/** @file React admin security view; authorization and authoritative state remain on the server. */
import { useEffect, useState } from 'react';
import { request } from '../lib/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
export default function AdminSecurity() {
  const { t, locale } = useI18n(),
    [status, setStatus] = useState(null),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [codes, setCodes] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    request('/api/admin/security')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="aftercare-panel">
      <h2>{t('Admin account security')}</h2>
      <p>{t('Two-factor authentication is required for every admin sign in.')}</p>
      {status && (
        <p>
          {t('Unused recovery codes')}: {status.recoveryCodesRemaining}
        </p>
      )}
      {codes ? (
        <>
          <p>
            {t(
              'Each recovery code works once. Store these privately offline; they will not be shown again.',
            )}
          </p>
          <ul>
            {codes.map((value) => (
              <li key={value}>
                <code>{value}</code>
              </li>
            ))}
          </ul>
          <button onClick={() => setCodes(null)}>{t('I saved my recovery codes')}</button>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            try {
              const result = await request('/api/admin/security/recovery', {
                method: 'POST',
                body: {
                  password,
                  code,
                },
              });
              setPassword('');
              setCode('');
              setCodes(result.recoveryCodes);
              setStatus({
                ...status,
                recoveryCodesRemaining: result.recoveryCodes.length,
              });
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t('Admin password')}
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {t('Fresh authenticator or recovery code')}
            <input
              required
              type="text"
              autoComplete="one-time-code"
              maxLength={80}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button disabled={busy}>{t('Replace recovery codes')}</button>
        </form>
      )}
      {status?.recentEvents?.length > 0 && (
        <ul>
          {status.recentEvents.map((event, index) => (
            <li key={index}>
              {new Date(event.at).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')} ·{' '}
              {t(event.action)}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
