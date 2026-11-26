/** @file React seat map view; authorization and authoritative state remain on the server. */
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useRef, useState } from 'react';
import { seatLayout } from '../domain/booking.js';
export default function SeatMap({
  boat,
  guests,
  selected,
  onChange,
  error,
  booked = [],
  held = [],
  loading = false,
  unavailable = false,
}) {
  const { t, locale } = useI18n();
  const [message, setMessage] = useState('');
  const seats = seatLayout(boat);
  const grid = useRef(null);
  const columns = boat.type === 'Party pontoon' ? 4 : 2;
  const rows = Array.from(
    {
      length: Math.ceil(boat.capacity / columns),
    },
    (_, index) => seats.filter((seat) => seat.row === index),
  );
  function toggle(id) {
    if (loading || unavailable || booked.includes(id) || held.includes(id)) return;
    if (selected.includes(id)) onChange(selected.filter((seat) => seat !== id));
    else if (selected.length < guests) onChange([...selected, id]);
    else {
      setMessage(`You have chosen all ${guests} seats. Deselect one before choosing another.`);
      return;
    }
    setMessage('');
  }
  return (
    <section className="seat-section" aria-labelledby="seat-title">
      <div className="seat-heading">
        <div>
          <h3 id="seat-title">{t('Choose your spot on board.')}</h3>
          <p>
            {t('Select')} {t(guests)} {t('seat')}
            {guests === 1 ? '' : t('s')}
            {t(', one for each guest.')}
          </p>
        </div>
        <span className="seat-count">
          {t(selected.length)} / {t(guests)}
        </span>
      </div>
      <p className="demo-note">
        {t('Keyboard: use arrow keys to move between available seats; Enter or Space selects.')}
      </p>
      <div className="seat-legend">
        <span>
          <i aria-hidden="true">○</i> {t('Available')}
        </span>
        <span>
          <i className="selected" aria-hidden="true">
            ✓
          </i>{' '}
          {t('Your seats')}
        </span>
        <span>
          <i className="booked" aria-hidden="true">
            ×
          </i>{' '}
          {t('Booked')}
        </span>
        <span>
          <i className="held" aria-hidden="true">
            ◷
          </i>{' '}
          {t('Temporarily held')}
        </span>
      </div>
      <div
        ref={grid}
        className={`seat-board ${columns === 4 ? 'pontoon' : 'pointed'}`}
        role="group"
        aria-label={t('{{v0}} numbered seating plan. Front at top, rear at bottom.', {
          v0: t(boat.name),
        })}
      >
        <svg
          className="boat-outline"
          viewBox="0 0 360 640"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={
              columns === 4
                ? 'M75 12Q180 -2 285 12Q340 20 340 65V590Q340 625 305 625H55Q20 625 20 590V65Q20 20 75 12Z'
                : 'M180 8Q328 72 337 235L326 585Q326 624 290 628H70Q34 624 34 585L23 235Q32 72 180 8Z'
            }
            fill={boat.type === 'Wooden boat' ? '#f6eee0' : '#e6eff0'}
            stroke={boat.tone}
            strokeWidth="6"
          />
          <path
            d="M58 242V568Q58 600 86 600H274Q302 600 302 568V242"
            fill="none"
            stroke={boat.tone}
            strokeOpacity=".2"
            strokeWidth="2"
          />
        </svg>
        <div className="boat-front">{t('\u2191 FRONT / BOW')}</div>
        <div className="captain-position">
          <span aria-hidden="true">☸</span> {t('Captain')}{' '}
          <small>{t('Not a passenger seat')}</small>
        </div>
        <div className="seat-sides">
          <span>{t('PORT \xB7 LEFT')}</span>
          <span>{t('RIGHT \xB7 STARBOARD')}</span>
        </div>
        <div className="seat-rows">
          {rows.map((row, index) => (
            <div
              key={index}
              className={`seat-row cols-${columns} ${row.length === 1 ? 'single-seat' : ''}`}
            >
              {row.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  className={`seat-button ${booked.includes(seat.id) ? 'is-booked' : held.includes(seat.id) ? 'is-held' : selected.includes(seat.id) ? 'is-selected' : ''}`}
                  style={{
                    gridColumn:
                      columns === 4 && seat.column >= 2 ? seat.column + 2 : seat.column + 1,
                  }}
                  disabled={
                    loading || unavailable || booked.includes(seat.id) || held.includes(seat.id)
                  }
                  aria-pressed={selected.includes(seat.id)}
                  aria-label={t('Seat {{v0}}, {{v1}}, {{v2}}{{v3}}', {
                    v0: seat.id,
                    v1: t(seat.zone.toLowerCase()),
                    v2: t(seat.side.toLowerCase()),
                    v3: booked.includes(seat.id)
                      ? t(', booked')
                      : held.includes(seat.id)
                        ? t(', temporarily held')
                        : selected.includes(seat.id)
                          ? t(', selected')
                          : t(', available'),
                  })}
                  onKeyDown={(event) => {
                    if (
                      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const index = seats.findIndex((item) => item.id === seat.id),
                      step =
                        event.key === 'ArrowUp'
                          ? -columns
                          : event.key === 'ArrowDown'
                            ? columns
                            : event.key === 'ArrowLeft'
                              ? -1
                              : 1;
                    let next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? seats.length - 1
                          : index + step;
                    const direction = event.key === 'End' ? -1 : step;
                    while (next >= 0 && next < seats.length) {
                      const button = grid.current?.querySelectorAll('.seat-button')[next];
                      if (button && !button.disabled) {
                        button.focus();
                        break;
                      }
                      next += direction;
                    }
                  }}
                  onClick={() => toggle(seat.id)}
                >
                  {seat.id}
                  <small aria-hidden="true">
                    {booked.includes(seat.id)
                      ? '×'
                      : held.includes(seat.id)
                        ? '◷'
                        : selected.includes(seat.id)
                          ? '✓'
                          : '○'}
                  </small>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="boat-rear">{t('REAR / STERN')}</div>
      </div>
      {loading && (
        <p className="demo-note" role="status">
          {t('Checking current seat availability\u2026')}
        </p>
      )}
      <p className="seat-status" role="status" aria-live="polite">
        {t(message) ||
          (selected.length === guests
            ? t('All guests have a seat. Deselect one to change your choice.')
            : t('Choose {{v0}} more seat{{v1}}.', {
                v0: t(guests - selected.length),
                v1: guests - selected.length === 1 ? '' : t('s'),
              }))}
      </p>
      <button
        type="button"
        className="outline wide"
        disabled={
          loading ||
          unavailable ||
          seats.filter((seat) => !booked.includes(seat.id) && !held.includes(seat.id)).length <
            guests
        }
        onClick={() => {
          onChange(
            seats
              .filter((seat) => !booked.includes(seat.id) && !held.includes(seat.id))
              .slice(0, guests)
              .map((seat) => seat.id),
          );
          setMessage('');
        }}
      >
        {t('Choose seats for me')}
      </button>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      <p className="seat-disclaimer">
        {t(
          'Illustrative seating plan. Your captain will confirm the actual layout. Booked seats are unavailable for this boat, date and time.',
        )}
      </p>
    </section>
  );
}
