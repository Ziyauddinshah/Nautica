/** @file Read-only payment recovery: checks the owned attempt without creating another charge. */
import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
export default function PaymentRecovery({ requestKey, onConfirmed, onHold, onAuthExpired }) {
  const { t } = useI18n(),
    mounted = useRef(false),
    busy = useRef(false);
  const [checking, setChecking] = useState(false),
    [message, setMessage] = useState('Payment confirmation is still pending.');
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const result = await request('/api/payments/status?' + new URLSearchParams({ requestKey }));
      if (!mounted.current) return;
      if (Number.isFinite(result.expires) && Number.isFinite(result.serverNow))
        onHold?.({ expires: result.expires, serverNow: result.serverNow });
      if (result.status === 'confirmed' && result.booking) {
        onConfirmed(result.booking);
        return;
      }
      setMessage(
        [
          'refund_required',
          'refund_pending',
          'refund_attention',
          'refunded',
          'refund_failed',
        ].includes(result.status)
          ? 'Your payment needs refund review. Check your account or contact support.'
          : result.status === 'not_found'
            ? 'No payment attempt is visible yet. Wait and check again before starting another payment.'
            : result.status === 'cancelled'
              ? 'This booking was cancelled. Review its refund status in your account.'
              : 'Payment confirmation is still pending.',
      );
    } catch (error) {
      if (mounted.current) {
        if (error.status === 401) onAuthExpired?.();
        setMessage(
          'Unable to check payment status. Reconnect and try checking again; do not pay again.',
        );
      }
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    check();
    return () => {
      mounted.current = false;
    };
  }, [requestKey]);
  return (
    <section className="payment-recovery" aria-labelledby="flow-title">
      <h2 id="flow-title" className="dialog-title">
        {t('Checking your payment')}
      </h2>
      <p>
        {t(
          'A closed checkout or lost connection does not mean payment failed. Do not pay again until the status is clear.',
        )}
      </p>
      <p role="status" aria-live="polite">
        {t(checking ? 'Checking the server for your booking…' : message)}
      </p>
      <button type="button" className="primary wide" disabled={checking} onClick={check}>
        {t(checking ? 'Checking payment…' : 'Check payment status')}
      </button>
      <a className="back-link" href="/account">
        {t('View booking and payment history')}
      </a>
    </section>
  );
}
