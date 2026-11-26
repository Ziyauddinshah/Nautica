/** @file Accessible countdown based on server hold duration; expiry never proves payment failure. */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
export default function HoldCountdown({ hold }) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(null);
  useEffect(() => {
    if (!hold) {
      setSeconds(null);
      return;
    }
    const end = performance.now() + Math.max(0, hold.expires - hold.serverNow);
    const tick = () => setSeconds(Math.max(0, Math.ceil((end - performance.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold]);
  if (seconds === null)
    return <p className="demo-note">{t('Seats are reserved only when checkout starts.')}</p>;
  return (
    <section
      className={`hold-countdown ${seconds <= 120 ? 'hold-warning' : ''}`}
      aria-label={t('Seat hold')}
    >
      <strong>{seconds === 0 ? t('Seat hold expired') : t('Seat hold remaining')}</strong>{' '}
      <span role="timer" aria-live="off">
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
      </span>
      <p role="status">
        {seconds === 0
          ? t(
              'Your hold has ended. Payment may still be processing. Check its status before paying again.',
            )
          : seconds <= 120
            ? t('Less than two minutes remain. Finish checkout soon.')
            : t('Your selected seats are temporarily held during checkout.')}
      </p>
    </section>
  );
}
