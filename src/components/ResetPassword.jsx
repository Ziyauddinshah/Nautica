/** @file React reset password view; authorization and authoritative state remain on the server. */
import LanguageSwitcher, { useI18n } from '../i18n/I18nProvider.jsx';
import { useState } from 'react';
import { request } from '../lib/api.js';
import { AuthForm } from './AuthForm.jsx';
export default function ResetPassword({ token, onUser }) {
  const { t, locale } = useI18n();
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [invalid, setInvalid] = useState(!token);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await request('/api/user/reset-password', {
        method: 'POST',
        body: {
          token,
          newPassword: password,
        },
      });
      setPassword('');
      setConfirmation('');
      setDone(true);
      onUser(null);
    } catch (error) {
      setError(error.message);
      if (error.status === 400 && /link/i.test(error.message)) setInvalid(true);
    } finally {
      setBusy(false);
    }
  }
  const login = (next) => {
    onUser(next);
    window.location.assign('/account');
  };
  return (
    <>
      <header className="header">
        <LanguageSwitcher />
        <a className="brand" href="/">
          {t('\u2693 Nautica')}
          <span className="brand-dot">.</span>
        </a>
        <a className="outline" href="/account">
          {t('Back to account')}
        </a>
      </header>
      <main className="account-main">
        <section className="account-login">
          {done ? (
            <AuthForm
              onSuccess={login}
              message="Password updated. All devices have been signed out. Sign in with your new password."
            />
          ) : invalid ? (
            <>
              <p className="error" role="alert">
                {t('This reset link is missing, invalid or expired. Request a new one below.')}
              </p>
              <AuthForm initialMode="forgot" onSuccess={login} />
            </>
          ) : (
            <>
              <p className="eyebrow">{t('ACCOUNT RECOVERY')}</p>
              <h1 className="dialog-title">{t('Choose a new password.')}</h1>
              <p className="subtitle">
                {t(
                  'No current password is needed. This link expires 15 minutes after it was requested and can be used once.',
                )}
              </p>
              <form onSubmit={submit}>
                <label className="field">
                  {t('New password')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="field">
                  {t('Confirm new password')}
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                {error && (
                  <p className="error" role="alert">
                    {t(error)}
                  </p>
                )}
                <button type="submit" className="primary wide" disabled={busy}>
                  {busy ? t('Updating password…') : t('Reset password')}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </>
  );
}
