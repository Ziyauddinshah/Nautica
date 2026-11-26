/** @file React booking dialog view; authorization and authoritative state remain on the server. */
import LanguageSwitcher, { useI18n } from '../i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import * as N from '../domain/booking.js';
import SeatMap from './SeatMap.jsx';
import { TripSummary, PriceBreakdown } from './TripSummary.jsx';
import PaymentForm, { emptyDraft } from './PaymentForm.jsx';
import { payRazorpay } from '../lib/razorpay.js';
import { request, getAvailability, bookSeats } from '../lib/api.js';
import HoldCountdown from './HoldCountdown.jsx';
import PaymentRecovery from './PaymentRecovery.jsx';
import BoardingPass from './BoardingPass.jsx';
export default function BookingDialog({
  flow,
  passes,
  currency,
  onCurrency,
  onClose,
  onBook,
  user,
  onAuthExpired,
}) {
  const { t, locale } = useI18n();
  const [paymentConfig, setPaymentConfig] = useState(null);
  useEffect(() => {
    let current = true;
    request('/api/payments/config')
      .then((value) => {
        if (current) setPaymentConfig(value);
      })
      .catch(() => {
        if (current) setPaymentConfig({ mode: 'disabled', enabled: false });
      });
    return () => {
      current = false;
    };
  }, []);
  const dialogRef = useRef(null);
  const timerRef = useRef(null);
  const payLock = useRef(false);
  const resolved = useRef(false);
  const [stage, setStage] = useState(flow.kind === 'booking' ? 'review' : flow.kind);
  const [trip, setTrip] = useState(flow.trip || null);
  const [activePass, setActivePass] = useState(flow.booking || null);
  useEffect(() => {
    const latest = passes?.find((pass) => pass.id === activePass?.id);
    if (latest && latest !== activePass) setActivePass(latest);
  }, [passes, activePass?.id]);
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft(),
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  }));
  const [error, setError] = useState('');
  const [booked, setBooked] = useState([]);
  const [held, setHeld] = useState([]);
  const [hold, setHold] = useState(null);
  const [availabilityState, setAvailabilityState] = useState('loading');
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = useRef(crypto.randomUUID());
  const alive = useRef(true);
  const boat = trip && (flow.boat || trip.boat || N.boats.find((item) => item.id === trip.boatId));
  const processing = stage === 'processing';
  useEffect(() => {
    alive.current = true;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return () => {
      alive.current = false;
      clearTimeout(timerRef.current);
      dialog.close();
    };
  }, []);
  useEffect(() => {
    dialogRef.current.scrollTop = 0;
    const title = dialogRef.current.querySelector('#flow-title');
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }, [stage]);
  useEffect(() => {
    if (!trip || activePass) return;
    let current = true,
      pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || payLock.current) return;
      pending = true;
      try {
        const result = await getAvailability(trip, controller.signal);
        if (!current) return;
        setBooked(result.bookedSeats);
        setHeld(result.heldSeats || []);
        setAvailabilityState('ready');
        setTrip((previous) => {
          const seats = previous.seats.filter((seat) => !result.bookedSeats.includes(seat));
          return seats.length === previous.seats.length
            ? previous
            : {
                ...previous,
                seats,
              };
        });
      } catch (error) {
        if (current && error.name !== 'AbortError') {
          setAvailabilityState('error');
          setError(error.message);
        }
      } finally {
        pending = false;
      }
    }
    setAvailabilityState('loading');
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [trip?.boatId, trip?.date, trip?.slot, refreshKey, activePass?.id]);
  useEffect(() => {
    if (!processing || paymentConfig?.mode !== 'razorpay') return;
    const timer = setTimeout(() => {
      if (alive.current) setStage('recovery');
    }, 30000);
    return () => clearTimeout(timer);
  }, [processing, paymentConfig?.mode]);
  function close() {
    if (!payLock.current || stage === 'recovery') {
      dialogRef.current.close();
      onClose();
    }
  }
  function proceed() {
    if (availabilityState !== 'ready') {
      setError('Current availability is not verified. Refresh seats before continuing.');
      return;
    }
    if (!N.validSeats(boat, trip.seats, trip.guests)) {
      setError(`Please choose ${trip.guests} seats, one for each guest, before continuing.`);
      dialogRef.current.querySelector('.seat-button')?.focus();
      return;
    }
    if (!paymentConfig?.enabled) {
      setError('Online booking is currently unavailable.');
      return;
    }
    setError('');
    setStage('details');
  }
  function pay(customer) {
    if (payLock.current) return;
    if (trip.date < N.localDate()) {
      setError('This boarding date has passed. Please choose a new trip.');
      return;
    }
    if (!N.validSeats(boat, trip.seats, trip.guests)) {
      setError('Choose one valid seat for each guest.');
      setStage('review');
      return;
    }
    if (availabilityState !== 'ready' || trip.seats.some((seat) => booked.includes(seat))) {
      setError('Seat availability changed. Choose your seats again.');
      setStage('review');
      return;
    }
    const payload = {
      ...customer,
      boatId: boat.id,
      date: trip.date,
      slot: trip.slot,
      guests: trip.guests,
      seats: [...trip.seats],
      extras: [...trip.extras],
      requestKey: requestKey.current,
    };
    payLock.current = true;
    setStage('processing');
    setError('');
    timerRef.current = setTimeout(async () => {
      try {
        const booking =
          paymentConfig?.mode === 'razorpay'
            ? await payRazorpay(payload, locale, (order) => {
                if (alive.current)
                  setHold({ expires: order.expires, serverNow: order.serverNow ?? Date.now() });
              })
            : await bookSeats(payload);
        if (!alive.current || resolved.current) return;
        try {
          onBook(booking);
        } catch {
          /* The server booking remains valid even if the offline cache is full. */
        }
        resolved.current = true;
        setActivePass(booking);
        setDraft(emptyDraft());
        setStage('confirmed');
      } catch (error) {
        if (!alive.current || resolved.current) return;
        setError(error.message);
        if (error.status === 401) {
          onAuthExpired?.();
          return;
        }
        if (error.checkoutNotStarted) {
          setStage('payment');
        } else if (paymentConfig?.mode === 'razorpay' && !error.seatConflict) {
          setStage('recovery');
        } else if (error.status === 409) {
          setBooked(error.data.bookedSeats || []);
          setTrip((previous) => ({
            ...previous,
            seats: [],
          }));
          setStage('review');
          setRefreshKey((key) => key + 1);
          requestKey.current = crypto.randomUUID();
        } else setStage('payment');
      } finally {
        payLock.current = false;
      }
    }, 2000);
  }
  function confirmed(booking) {
    if (resolved.current) return;
    resolved.current = true;
    payLock.current = false;
    try {
      onBook(booking);
    } catch {}
    setActivePass(booking);
    setDraft(emptyDraft());
    setStage('confirmed');
  }
  return (
    <dialog
      id="flow"
      ref={dialogRef}
      aria-labelledby="flow-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-top">
        <LanguageSwitcher />
        <span className="small-brand">{t('\u2693 NAUTICA')}</span>
        <button
          className="quiet"
          disabled={processing}
          onClick={onCurrency}
          aria-label={t('Switch currency')}
        >
          {currency === 'INR' ? t('₹ INR') : t('$ USD')} ⇄
        </button>
        <button
          className="icon-button"
          disabled={processing}
          onClick={close}
          aria-label={t('Close booking')}
        >
          ✕
        </button>
      </div>
      <div id="flow-body">
        {trip && !activePass && (
          <>
            <ol className="booking-progress" aria-label={t('Booking progress')}>
              {['Trip', 'Seats', 'Passenger details', 'Payment'].map((label, index) => (
                <li
                  key={label}
                  aria-current={
                    index === (stage === 'review' ? 1 : stage === 'details' ? 2 : 3)
                      ? 'step'
                      : undefined
                  }
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {t(label)}
                </li>
              ))}
            </ol>
            {stage === 'review' && (
              <button className="back-link" onClick={close}>
                {t('Change trip')}
              </button>
            )}
            {paymentConfig?.mode === 'razorpay' && <HoldCountdown hold={hold} />}
          </>
        )}

        {stage === 'review' && (
          <>
            <p className="steps">{t('01 / YOUR VOYAGE')}</p>
            <h2 id="flow-title" className="dialog-title">
              {t('Make it yours.')}
            </h2>
            <p className="subtitle">{t('A few thoughtful touches for a memorable trip.')}</p>
            <TripSummary boat={boat} trip={trip} />
            <SeatMap
              boat={boat}
              guests={trip.guests}
              selected={trip.seats}
              error={error}
              booked={booked.filter((seat) => !held.includes(seat))}
              held={held}
              loading={availabilityState === 'loading'}
              unavailable={availabilityState === 'error'}
              onChange={(seats) => {
                setTrip({
                  ...trip,
                  seats,
                });
                setError('');
                requestKey.current = crypto.randomUUID();
              }}
            />
            <button
              type="button"
              className="back-link"
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              {t('Refresh seat availability')}
            </button>
            <div className="extras">
              {N.extras.map((extra) => (
                <label className="addon" key={extra.id}>
                  <input
                    type="checkbox"
                    checked={trip.extras.includes(extra.id)}
                    disabled={extra.id === 'safety'}
                    onChange={(event) =>
                      setTrip({
                        ...trip,
                        extras: event.target.checked
                          ? [...trip.extras, extra.id]
                          : trip.extras.filter((id) => id !== extra.id),
                      })
                    }
                  />
                  <span className="addon-text">
                    <strong>{t(extra.name)}</strong>
                    <small>{t(extra.detail)}</small>
                  </span>
                  <span>
                    {extra.price
                      ? t('+ {{v0}}', {
                          v0: t(N.money(extra.price, currency, locale)),
                        })
                      : t('Included')}
                  </span>
                </label>
              ))}
            </div>
            <PriceBreakdown boat={boat} trip={trip} currency={currency} />
            <div className="checkout-actions">
              <span>
                {t('Grand total')}{' '}
                <strong>{t(N.money(N.amounts(boat, trip.extras).total, currency, locale))}</strong>
              </span>
              <button className="primary wide" onClick={proceed}>
                {t('Continue to passenger details')}{' '}
                {t(N.money(N.amounts(boat, trip.extras).total, currency, locale))} →
              </button>
            </div>
            <p className="demo-note">
              {t(
                'Group trip fare. Your captain is included. Only your selected seats are reserved.',
              )}
            </p>
          </>
        )}
        {(stage === 'payment' || stage === 'details') && (
          <PaymentForm
            cancellationPolicy={paymentConfig?.cancellationPolicy}
            paymentMode={paymentConfig?.mode}
            boat={boat}
            trip={trip}
            currency={currency}
            draft={draft}
            onDraft={setDraft}
            accountEmail={user?.email}
            phase={stage}
            onPay={
              stage === 'details'
                ? () => {
                    setError('');
                    setStage('payment');
                  }
                : pay
            }
            onBack={() => {
              setError('');
              setStage(stage === 'payment' ? 'details' : 'review');
            }}
            error={error}
          />
        )}
        {stage === 'recovery' && (
          <PaymentRecovery
            requestKey={requestKey.current}
            onConfirmed={confirmed}
            onHold={setHold}
            onAuthExpired={onAuthExpired}
          />
        )}
        {processing && (
          <div className="processing" role="status">
            <div className="spinner" />
            <h2 id="flow-title" className="dialog-title">
              {t('A moment, then the horizon.')}
            </h2>
            <p className="subtitle">
              {t(
                paymentConfig?.mode === 'razorpay'
                  ? 'Waiting for payment confirmation…'
                  : 'Simulating secure payment processing…',
              )}
            </p>
          </div>
        )}
        {stage === 'passes' && (
          <>
            <p className="steps">{t('YOUR JOURNEYS')}</p>
            <h2 id="flow-title" className="dialog-title">
              {t('My boarding passes.')}
            </h2>
            <p className="subtitle">
              {t('Your signed-in account bookings. Download passes for offline access.')}
            </p>
            <div className="pass-list">
              {passes.length ? (
                passes.map((pass) => (
                  <button
                    key={pass.id}
                    className="saved-pass"
                    onClick={() => {
                      setActivePass(pass);
                      setStage('pass');
                    }}
                  >
                    <strong>
                      {t(
                        (pass.boat || N.boats.find((boat) => boat.id === pass.boatId))?.name ||
                          pass.boatId,
                      )}
                    </strong>
                    <small>
                      {t(pass.date)} · {t(pass.slot)}
                      <br />
                      {pass.id} · {t(pass.guests)} {t('guests \xB7')}{' '}
                      {t(N.money(pass.total, currency, locale))}
                    </small>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <h3>{t('Your horizon is waiting.')}</h3>
                  <p>{t('Your first boarding pass will appear here after booking.')}</p>
                </div>
              )}
            </div>
          </>
        )}
        {(stage === 'confirmed' || stage === 'pass') && (
          <BoardingPass
            booking={activePass}
            currency={currency}
            confirmed={stage === 'confirmed'}
            onExplore={close}
          />
        )}
      </div>
    </dialog>
  );
}
