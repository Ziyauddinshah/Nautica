/** @file Email proof UI keeps tokens in memory, requires the matching signed-in account and explicit confirmation. */
import { useState } from 'react';
import { request } from '../lib/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
export function EmailVerificationNotice({ user }) {
  const { t } = useI18n(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  if (user?.emailVerified !== false) return null;
  return (
    <section className="aftercare-panel" aria-label={t('Verify your email')}>
      <h2>{t('Verify your email')}</h2>
      <p>
        {t(
          'Confirm your email before booking or registering a boat. Booking emails are held until verification.',
        )}
      </p>
      <p>{user.email}</p>
      <button
        className="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await request('/api/user/email/request', { method: 'POST', body: {} });
            setMessage('Verification link requested. Check your inbox and spam folder.');
          } catch (error) {
            setMessage(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t(busy ? 'Sending…' : 'Send verification link')}
      </button>
      {message && <p role="status">{t(message)}</p>}
    </section>
  );
}
export default function VerifyEmail({ user, onUser, token = null }) {
  const { t } = useI18n(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [done, setDone] = useState(false);
  return (
    <main className="account-main">
      <h1>{t('Verify your email')}</h1>
      {!user ? (
        <>
          <p>
            {t(
              'Sign in to the same account in another tab, then return here and reload your session. Keep this page open.',
            )}
          </p>
          <a href="/account" target="_blank" rel="noopener noreferrer">
            {t('Sign in')}
          </a>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await request('/api/user/session');
                onUser(result.user);
              } catch (error) {
                setMessage(error.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Reload session')}
          </button>
        </>
      ) : (
        <>
          <p>{user.email}</p>
          {token && !done ? (
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request('/api/user/email/verify', { method: 'POST', body: { token } });
                  const result = await request('/api/user/session');
                  onUser(result.user);
                  setDone(true);
                  setMessage('Email verified. You can now continue booking.');
                } catch (error) {
                  setMessage(error.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('Confirm email verification')}
            </button>
          ) : !done ? (
            <p>
              {t('This verification link is invalid or expired. Sign in and request a new link.')}
            </p>
          ) : null}
          <EmailVerificationNotice user={done ? { ...user, emailVerified: true } : user} />
        </>
      )}
      {message && <p role="status">{t(message)}</p>}
      <a className="back-link" href="/account">
        {t('My account')}
      </a>
    </main>
  );
}
