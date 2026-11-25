import { useState } from 'react';
import { request } from '../lib/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import QrCode from './QrCode.jsx';
export default function AdminSignIn({
  onSuccess
}) {
  const {
      t
    } = useI18n(),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [phase, setPhase] = useState('password'),
    [setup, setSetup] = useState(null),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState(null),
    [session, setSession] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (phase === 'password') {
        const result = await request('/api/admin/login', {
          method: 'POST',
          body: {
            username,
            password
          }
        });
        setPassword('');
        if (!result.mfaRequired) {
          onSuccess(result);
          return;
        }
        if (result.enrollmentRequired) {
          setSetup(await request('/api/admin/mfa/setup', {
            method: 'POST',
            body: {}
          }));
          setPhase('setup');
        } else setPhase('verify');
      } else {
        const result = await request('/api/admin/mfa/verify', {
          method: 'POST',
          body: {
            code
          }
        });
        setCode('');
        setSetup(null);
        if (result.recoveryCodes) {
          setRecovery(result.recoveryCodes);
          setSession({
            username: result.username
          });
          setPhase('recovery');
        } else onSuccess(result);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (phase === 'complete') return <p role="status">{t('Admin sign in completed.')}</p>;
  return <section className="admin-login"><h1>{t('Admin sign in')}</h1>{phase === 'recovery' ? <><h2>{t('Save your recovery codes')}</h2><p>{t('Each recovery code works once. Store these privately offline; they will not be shown again.')}</p><ul className="recovery-codes">{recovery.map(value => <li key={value}><code>{value}</code></li>)}</ul><button className="primary" onClick={() => {
        setRecovery(null);
        setPhase('complete');
        onSuccess(session);
        setSession(null);
      }}>{t('I saved my recovery codes')}</button></> : <form onSubmit={submit}>{phase === 'password' ? <><label className="field">{t('Admin username')}<input required autoComplete="username" maxLength={80} value={username} onChange={e => setUsername(e.target.value)} /></label><label className="field">{t('Admin password')}<input required type="password" autoComplete="current-password" maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label></> : <>{setup && <><p>{t('Scan this QR code with your authenticator app, then enter its six digit code. Keep the setup key private.')}</p><QrCode value={setup.uri} label="Authenticator setup QR code" /><details><summary>{t('Manual setup key')}</summary><code>{setup.secret}</code></details></>}<label className="field">{t(setup ? 'Authenticator code' : 'Authenticator or recovery code')}<input required type="text" autoComplete="one-time-code" maxLength={80} value={code} onChange={e => setCode(e.target.value)} /></label><p>{t('Authenticator codes are single use. Wait for a fresh code if you just used one.')}</p></>}<button className="primary" disabled={busy}>{t(phase === 'password' ? 'Sign in as admin' : 'Verify admin sign in')}</button>{phase !== 'password' && <button type="button" disabled={busy} onClick={() => {
        setSetup(null);
        setCode('');
        setPhase('password');
      }}>{t('Start sign in again')}</button>}</form>}{error && <p role="alert">{t(error)}</p>}</section>;
}
