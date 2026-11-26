/** @file Public reviewed listing details with honest missing-information and photo fallbacks. */
import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { pierDirections } from '../lib/directions.js';
export function BoatPhoto({ boat, fallback }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const safe =
    typeof boat.photoUrl === 'string' &&
    /^\/api\/boats\/BT-[A-F0-9]{16}\/photo\?revision=\d+$/.test(boat.photoUrl);
  return safe && !failed ? (
    <img
      className="listing-photo"
      src={boat.photoUrl}
      alt={boat.photoAlt || boat.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="boat-illustration">
      {fallback}
      <span>{t('Illustration · photo not supplied')}</span>
    </div>
  );
}
export default function BoatDetails({ boat }) {
  const { t, locale } = useI18n();
  const text = (key) => (locale === 'hi' && boat[key + 'Hi']) || boat[key];
  return (
    <details className="boat-details">
      <summary>{t('Boat details and boarding information')}</summary>
      <p>{text('description') || t('Ask the operator for more details about this boat.')}</p>
      <h4>{t('Boarding location')}</h4>
      <p>{t(boat.pier)}</p>
      <p>
        {text('boardingInstructions') ||
          t('Confirm the exact meeting point with the operator before travel.')}
      </p>
      <a
        href={pierDirections(boat.pier)}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        {t('Directions to boarding pier (Google Maps, new tab)')}
      </a>
      <h4>{t('Amenities')}</h4>
      <p>
        {boat.amenities?.length
          ? boat.amenities.map((item) => t(item)).join(' · ')
          : t('Ask the operator to confirm amenities.')}
      </p>
      <h4>{t('Accessibility and boarding assistance')}</h4>
      <p>
        {text('accessibilityNotes') ||
          t(
            'Accessibility information has not been supplied. Confirm boarding assistance before booking.',
          )}
      </p>
      <h4>{t('Safety information')}</h4>
      <p>
        {text('safetyNotes') || t('Follow the captain’s safety briefing and wear a life jacket.')}
      </p>
      {Number.isInteger(boat.lifeJackets) && (
        <p>{t('Life jackets listed: {{count}}', { count: boat.lifeJackets })}</p>
      )}
      <p>
        {t('Certified passenger capacity')}: {boat.capacity}
      </p>
      <small>
        {t(
          'Listing information is reviewed by an administrator. Confirm any specific needs with the operator; review does not guarantee accessibility.',
        )}
      </small>
    </details>
  );
}
