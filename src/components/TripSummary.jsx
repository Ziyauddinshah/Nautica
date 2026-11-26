/** @file React trip summary view; authorization and authoritative state remain on the server. */
import { useI18n } from '../i18n/I18nProvider.jsx';
import { amounts, extras, money, seatText } from '../domain/booking.js';
export function TripSummary({ boat, trip }) {
  const { t, locale } = useI18n();
  return (
    <div className="trip-summary">
      <strong>{t(boat.name)}</strong>
      <p>
        {t(boat.pier)}
        <br />
        {t(trip.date)} · {t(trip.slot)}
        <br />
        {t(trip.guests)} {t('guests \xB7 Seat reservation \xB7 1 hour')}
        <br />
        {t('Seats:')} {t(seatText(boat, trip.seats))}
      </p>
    </div>
  );
}
export function PriceBreakdown({ boat, trip, currency }) {
  const { t, locale } = useI18n();
  const price = amounts(boat, trip.extras);
  return (
    <div className="breakdown">
      <div className="money-row">
        <span>{t('Base group fare')}</span>
        <span>{t(money(price.base, currency, locale))}</span>
      </div>
      {extras
        .filter((extra) => trip.extras.includes(extra.id))
        .map((extra) => (
          <div className="money-row" key={extra.id}>
            <span>{t(extra.name)}</span>
            <span>{extra.price ? t(money(extra.price, currency, locale)) : t('Included')}</span>
          </div>
        ))}
      <div className="money-row">
        <span>{t('Port & pier fee \xB7 5%')}</span>
        <span>{t(money(price.fee, currency, locale))}</span>
      </div>
      <div className="money-row total">
        <span>{t('Grand total')}</span>
        <span>{t(money(price.total, currency, locale))}</span>
      </div>
    </div>
  );
}
