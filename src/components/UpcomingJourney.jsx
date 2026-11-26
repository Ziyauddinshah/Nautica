/** @file Nearest owned journey shortcut with pier directions and current boarding-pass access. */
import { useI18n } from '../i18n/I18nProvider.jsx';
import { pierDirections } from '../lib/directions.js';
export default function UpcomingJourney({ record, onPass }) {
  const { t, locale } = useI18n();
  if (!record) return null;
  const start = Date.parse(record.departureAt),
    inProgress = record.journeyState === 'in_progress';
  return (
    <section className="next-journey" aria-label={t('Your next journey')}>
      <p className="eyebrow">{t('Your next journey')}</p>
      <h2>{t(record.boat.name)}</h2>
      <p>
        <strong>{t(inProgress ? 'Journey in progress' : 'Departure')}</strong>:{' '}
        {new Date(start).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
          timeZone: record.boat.timeZone || 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        })}{' '}
        ({t('Local time at boarding pier')})
      </p>
      <p>
        {t('Seats:')} {record.trip.seats.join(', ')} · {t(record.boat.pier)}
      </p>
      <p>
        {(locale === 'hi' && record.boat.boardingInstructionsHi) ||
          record.boat.boardingInstructions ||
          t('Confirm the exact meeting point with the operator before travel.')}
      </p>
      <p>{t('Arrive 15 minutes early')}</p>
      {record.cancellation?.status === 'requested' && (
        <p role="status">{t('Boarding is paused while your cancellation is reviewed.')}</p>
      )}
      <div className="journey-actions">
        <button
          className="primary"
          disabled={!record.pass || record.cancellation?.status === 'requested'}
          onClick={() => onPass(record.pass)}
        >
          {t('Open journey boarding pass')}
        </button>
        <a
          href={pierDirections(record.boat.pier)}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          {t('Directions to boarding pier (Google Maps, new tab)')}
        </a>
      </div>
      <small>{t('Directions locate the pier, not an exact boarding berth.')}</small>
    </section>
  );
}
