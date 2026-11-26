/** @file React auth form view; authorization and authoritative state remain on the server. */
import LanguageSwitcher, { useI18n } from '../i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
export function AuthForm({ onSuccess, message = '', initialMode = 'login' }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState(initialMode),
    [values, setValues] = useState({
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmation: '',
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const register = mode === 'register',
    forgot = mode === 'forgot';
  const change = (key, value) => {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
    setError('');
    setNotice('');
  };
  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
    setValues((previous) => ({
      ...previous,
      password: '',
      confirmation: '',
    }));
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (register && values.password !== values.confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (forgot) {
        const result = await request('/api/user/forgot-password', {
          method: 'POST',
          body: {
            email: values.email,
          },
        });
        setNotice(result.message);
        return;
      }
      const { user } = await request(`/api/user/${mode}`, {
        method: 'POST',
        body: register
          ? {
              name: values.name,
              email: values.email,
              phone: values.phone,
              password: values.password,
            }
          : {
              email: values.email,
              password: values.password,
            },
      });
      setValues({
        name: '',
        phone: '',
        email: '',
        password: '',
        confirmation: '',
      });
      onSuccess(user);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="customer-auth">
      <p className="eyebrow">{t('YOUR NAUTICA ACCOUNT')}</p>
      <h2 id="auth-title" className="dialog-title">
        {forgot
          ? t('Reset your password.')
          : register
            ? t('Your next horizon starts here.')
            : t('Welcome back.')}
      </h2>
      <p className="subtitle">
        {forgot
          ? t(
              'Enter your registered email to request a single-use reset link, valid for 15 minutes.',
            )
          : message || t('Sign in to book seats and view your booking and payment history.')}
      </p>
      <form onSubmit={submit}>
        {register && (
          <>
            <label className="field">
              {t('Full name')}
              <input
                value={values.name}
                onChange={(event) => change('name', event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label className="field">
              {t('Phone number')}
              <input
                type="tel"
                value={values.phone}
                onChange={(event) => change('phone', event.target.value)}
                autoComplete="tel"
                maxLength={25}
                required
              />
            </label>
          </>
        )}
        <label className="field">
          {t('Email address')}
          <input
            type="email"
            value={values.email}
            onChange={(event) => change('email', event.target.value)}
            autoComplete="email"
            maxLength={150}
            required
          />
        </label>
        {!forgot && (
          <label className="field">
            {t('Password')}
            <input
              type="password"
              value={values.password}
              onChange={(event) => change('password', event.target.value)}
              aria-describedby={register ? 'registration-password-help' : undefined}
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 12 : 1}
              maxLength={256}
              required
            />
          </label>
        )}
        {register && (
          <>
            <p className="demo-note" id="registration-password-help">
              {t('Use at least 12 characters. A unique passphrase is a good choice.')}
            </p>
            <label className="field">
              {t('Confirm password')}
              <input
                type="password"
                value={values.confirmation}
                onChange={(event) => change('confirmation', event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
        {notice && (
          <p className="demo-note" role="status">
            {t(notice)}
          </p>
        )}
        <button className="primary wide" type="submit" disabled={busy}>
          {busy
            ? t('Please wait…')
            : forgot
              ? t('Send reset link')
              : register
                ? t('Create account')
                : t('Sign in')}
        </button>
      </form>
      {mode === 'login' && (
        <button className="back-link" disabled={busy} onClick={() => switchMode('forgot')}>
          {t('Forgot password?')}
        </button>
      )}
      <button
        className="back-link"
        disabled={busy}
        onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login'
          ? t('New here? Create an account')
          : forgot
            ? t('Back to sign in')
            : t('Already registered? Sign in')}
      </button>
    </section>
  );
}
export default function AuthDialog({ onSuccess, onClose }) {
  const { t, locale } = useI18n();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="auth-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-top">
        <LanguageSwitcher />
        <span className="small-brand">{t('\u2693 NAUTICA')}</span>
        <button className="icon-button" aria-label={t('Close sign in')} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="auth-dialog-body">
        <AuthForm onSuccess={onSuccess} />
      </div>
    </dialog>
  );
}
