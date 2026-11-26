/** @file React owner verification view; authorization and authoritative state remain on the server. */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { request } from '../lib/api.js';
export default function OwnerVerification({ user, onStatus }) {
  const { t } = useI18n(),
    [state, setState] = useState(null),
    [phone, setPhone] = useState(user.phone || ''),
    [code, setCode] = useState(''),
    [consent, setConsent] = useState(false),
    [identityConsent, setIdentityConsent] = useState(false),
    [method, setMethod] = useState('aadhaar'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false),
    [notice, setNotice] = useState('');
  async function refresh(signal) {
    const data = await request('/api/owner/verification', {
      signal,
    });
    setState(data);
    onStatus(data.mobileVerified && data.identityVerified);
  }
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((e) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, [user.id]);
  async function act(action, body) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/owner/verification/' + action, {
        method: 'POST',
        body,
      });
      if (action === 'mobile/send') {
        setSent(true);
        setCode('');
        setNotice('Verification code sent. It expires in 5 minutes.');
      }
      if (action === 'mobile/verify') {
        setCode('');
        setSent(false);
        setNotice('Mobile number verified.');
        await refresh();
      }
      if (action === 'identity/start') {
        window.location.assign(result.url);
      }
      if (action === 'identity/check') {
        setNotice(
          result.verified ? 'Identity verified.' : 'Identity verification is still pending.',
        );
        await refresh();
      }
    } catch (e) {
      setError(e.message);
      onStatus(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="owner-verification">
      <h2 id="owner-verification">{t('Verify boat owner')}</h2>
      <p>
        {t(
          'Verify your mobile number and legal identity before registering a boat. Your account name must match your verified legal name.',
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {notice && <p role="status">{t(notice)}</p>}
      <p>
        {t('Mobile verification')}: {t(state?.mobileVerified ? 'Verified' : 'Not verified')}
      </p>
      {state && !state.mobileEnabled && !state.mobileVerified && (
        <p>{t('Mobile verification is unavailable. Contact support.')}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act('mobile/send', {
            phone,
            consent,
          });
        }}
      >
        <label>
          {t('Mobile number')}
          <input
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            maxLength={25}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="fleet-check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t('I agree to receive an SMS code to verify this mobile number.')}
        </label>
        <button disabled={busy || !consent || !state?.mobileEnabled}>
          {t(sent ? 'Resend code' : 'Send verification code')}
        </button>
      </form>
      {sent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act('mobile/verify', {
              code,
            });
          }}
        >
          <label>
            {t('Six digit verification code')}
            <input
              required
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button disabled={busy || code.length !== 6}>{t('Verify mobile')}</button>
        </form>
      )}
      <p>
        {t('Identity verification')}: {t(state?.identityVerified ? 'Verified' : 'Not verified')}
      </p>
      {state?.identity && (
        <p>
          {state.identity.name} ·{' '}
          {t(state.identity.method === 'aadhaar' ? 'Aadhaar' : 'Alternative identity')}
        </p>
      )}
      <p>
        {t(
          'Aadhaar verification is voluntary. You may use an alternative identity method. Enter Aadhaar details only on the authorized provider page; do not upload Aadhaar cards as boat documents.',
        )}
      </p>
      {state && !state.identityEnabled && !state.identityVerified && (
        <p>
          {t(
            'Identity verification is not configured. Contact support to arrange an authorized verification method.',
          )}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act('identity/start', {
            method,
            consent: identityConsent,
          });
        }}
      >
        <label>
          {t('Identity method')}
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="aadhaar">{t('Aadhaar')}</option>
            <option value="alternative">{t('Alternative identity')}</option>
          </select>
        </label>
        <label className="fleet-check">
          <input
            type="checkbox"
            checked={identityConsent}
            onChange={(e) => setIdentityConsent(e.target.checked)}
          />
          {t(
            'I consent to identity verification for boat owner registration and storage of the verification result, legal name and validity. Nautica does not request my full Aadhaar number.',
          )}
        </label>
        <button disabled={busy || !identityConsent || !state?.identityEnabled}>
          {t('Continue to identity verification')}
        </button>
      </form>
      <button disabled={busy || !state?.identityEnabled} onClick={() => act('identity/check', {})}>
        {t('Check identity verification status')}
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          refresh()
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {t('Refresh verification status')}
      </button>
    </section>
  );
}
