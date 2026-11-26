/** @file Coordinates public booking screens, route selection and application UI state. */
import OperationsDashboard from './components/OperationsDashboard.jsx';
import FleetPortal from './components/FleetPortal.jsx';
import useBackgroundRefresh from './hooks/useBackgroundRefresh.js';
import LanguageSwitcher, { useI18n } from './i18n/I18nProvider.jsx';
import { useEffect, useRef, useState } from 'react';
import * as N from './domain/booking.js';
import { CURRENCY_KEY, loadCurrency } from './lib/storage.js';
import BoatArt from './components/BoatArt.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import useCustomerSession from './hooks/useCustomerSession.js';
import AuthDialog from './components/AuthForm.jsx';
import ResetPassword from './components/ResetPassword.jsx';
import CustomerAccount from './components/CustomerAccount.jsx';
import { request } from './lib/api.js';
import BookingDialog from './components/BookingDialog.jsx';
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return N.localDate(date);
};
function Brand() {
  const { t, locale } = useI18n();
  return (
    <a className="brand" href="./" aria-label={t('Nautica home')}>
      <span className="brand-icon" aria-hidden="true">
        ⚓
      </span>
      {t('Nautica')}
      <span className="brand-dot">.</span>
    </a>
  );
}
export default function App({ resetToken = null }) {
  const { t, locale } = useI18n();
  const [currency, setCurrency] = useState(loadCurrency);
  const [history, setHistory] = useState({
    owner: null,
    items: [],
  });
  const { user, setUser } = useCustomerSession();
  const backgroundRefresh = useBackgroundRefresh(Boolean(user));
  const passes = history.owner === user?.id ? history.items : [];
  function setPasses(next) {
    setHistory((previous) => ({
      owner: user?.id || null,
      items:
        typeof next === 'function' ? next(previous.owner === user?.id ? previous.items : []) : next,
    }));
  }
  const [authOpen, setAuthOpen] = useState(false);
  const pendingAction = useRef(null),
    previousUser = useRef(null);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState(() => ({
    pier: '',
    date: tomorrow(),
    slot: N.slots[0],
    type: N.types[0],
    guests: 2,
  }));
  const [flow, setFlow] = useState(null);
  const filtersRef = useRef(null);
  const collectionRef = useRef(null);
  const openerRef = useRef(null);
  const [catalog, setCatalog] = useState([]),
    [catalogError, setCatalogError] = useState(''),
    [catalogLoading, setCatalogLoading] = useState(true),
    [catalogRefresh, setCatalogRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    request('/api/boats', { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data.boats)) throw new Error('Unable to load boats.');
        setCatalog(data.boats);
        setCatalogError('');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setCatalog([]);
          setCatalogError('Unable to load boats.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [catalogRefresh, backgroundRefresh]);
  const found = catalog.filter(
    (boat) =>
      (!filters.pier || boat.pier === filters.pier) &&
      (filters.type === N.types[0] || boat.type === filters.type) &&
      boat.capacity >= filters.guests,
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function changed(event) {
      if (event.key === CURRENCY_KEY || event.key === null) setCurrency(loadCurrency());
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    const prior = previousUser.current;
    previousUser.current = user?.id || null;
    if (prior && prior !== user?.id) setFlow(null);
    if (prior !== (user?.id || null)) setPasses([]);
    if (!user) return;
    const controller = new AbortController();
    request('/api/user/bookings', {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setPasses(data.bookings.map((record) => record.pass));
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          if (error.status === 401) setUser(null);
          else setNotice(error.message);
        }
      });
    return () => controller.abort();
  }, [user?.id, backgroundRefresh]);
  function beginAuth(action, opener) {
    pendingAction.current = action;
    openerRef.current = opener;
    setAuthOpen(true);
  }
  function signedIn(next) {
    setUser(next);
    setAuthOpen(false);
    if (pendingAction.current) setFlow(pendingAction.current);
    pendingAction.current = null;
  }
  function toggleCurrency() {
    const next = currency === 'INR' ? 'USD' : 'INR';
    setCurrency(next);
    try {
      localStorage.setItem(CURRENCY_KEY, JSON.stringify(next));
    } catch {
      setNotice('Currency changed for this visit. Browser storage is unavailable.');
    }
  }
  function openFlow(next, opener) {
    openerRef.current = opener;
    setFlow(next);
  }
  function closeFlow() {
    setFlow(null);
    openerRef.current?.focus();
  }
  function book(boat, event) {
    if (!filtersRef.current.reportValidity()) return;
    if (filters.date < N.localDate()) {
      setNotice('Choose today or a future boarding date.');
      return;
    }
    const next = {
      kind: 'booking',
      boat,
      trip: {
        boatId: boat.id,
        date: filters.date,
        slot: filters.slot,
        guests: filters.guests,
        seats: [],
        extras: ['safety'],
      },
    };
    if (user === undefined) {
      setNotice('Checking your session. Please try again in a moment.');
      return;
    }
    if (!user) {
      beginAuth(next, event.currentTarget);
      return;
    }
    openFlow(next, event.currentTarget);
  }
  if (['/owner', '/admin/fleet'].includes(window.location.pathname.replace(/\/$/, '')))
    return (
      <FleetPortal
        key={window.location.pathname.startsWith('/admin') ? 'admin' : user?.id || 'guest'}
        admin={window.location.pathname.startsWith('/admin')}
        user={user}
        onUser={setUser}
      />
    );
  if (window.location.pathname.replace(/\/$/, '') === '/admin/operations')
    return <OperationsDashboard />;
  if (window.location.pathname.replace(/\/$/, '') === '/admin') return <AdminDashboard />;
  if (window.location.pathname.replace(/\/$/, '') === '/reset-password')
    return <ResetPassword token={resetToken} onUser={setUser} />;
  if (window.location.pathname.replace(/\/$/, '') === '/account')
    return (
      <CustomerAccount
        key={user?.id || 'guest'}
        user={user}
        onUser={setUser}
        currency={currency}
        onCurrency={toggleCurrency}
      />
    );
  return (
    <>
      <header className="header">
        <LanguageSwitcher />
        <Brand />
        <span className="header-note">{t('LESS ORDINARY. MORE OPEN WATER.')}</span>
        <nav aria-label={t('Main navigation')}>
          <a className="quiet" href="/owner">
            {t('Register a boat')}
          </a>
          {user ? (
            <a className="quiet account-link" href="/account">
              {t('My account')}
            </a>
          ) : (
            <button
              className="quiet"
              disabled={user === undefined}
              onClick={(event) => beginAuth(null, event.currentTarget)}
            >
              {t('Sign in / Register')}
            </button>
          )}
          <button
            className="quiet"
            onClick={toggleCurrency}
            aria-label={t('Currency {{v0}}. Switch to {{v1}}', {
              v0: t(currency),
              v1: currency === 'INR' ? t('USD') : t('INR'),
            })}
          >
            {currency === 'INR' ? t('₹ INR') : t('$ USD')} ⇄
          </button>
          <button
            className="outline"
            disabled={user === undefined}
            onClick={(event) =>
              user
                ? openFlow(
                    {
                      kind: 'passes',
                    },
                    event.currentTarget,
                  )
                : beginAuth(
                    {
                      kind: 'passes',
                    },
                    event.currentTarget,
                  )
            }
          >
            {t('My passes')}{' '}
            <span className="count">
              {t(
                passes.filter(
                  (pass) => pass.date >= N.localDate() && pass.bookingStatus !== 'cancelled',
                ).length,
              )}
            </span>
          </button>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> {t('YOUR NEXT CHAPTER, ON THE WATER')}
            </p>
            <h1>
              {t('A different')}
              <br />
              {t('kind of')} <em>{t('escape.')}</em>
            </h1>
            <p className="intro">
              {t('Discover Varanasi from the Ganges.')}
              <br />
              {t('Find your boat. We\u2019ll take care of the rest.')}
            </p>
            <div className="hero-proof">
              <span>{t('\u2727 Captain included')}</span>
              <span>{t('\u2661 Curated experiences')}</span>
              <span>{t('\u2713 Safety first')}</span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label={t('Illustration of a sailboat on calm coastal water')}
            role="img"
          >
            <BoatArt boat={N.boats[0]} />
          </div>
          <div className="hero-caption">
            <span>{t('01 / THE OPEN WATER COLLECTION')}</span>
            <span>{t('Made for moments that stay with you \u2197')}</span>
          </div>
        </section>
        <section className="search" aria-labelledby="search-title">
          <div className="search-heading">
            <h2 id="search-title">{t('Where shall we take you?')}</h2>
            <span>{t('Your own boat. Your own pace.')}</span>
          </div>
          <form
            id="filters"
            ref={filtersRef}
            onSubmit={(event) => {
              event.preventDefault();
              collectionRef.current.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
              });
            }}
          >
            <label className="filter-field">
              {t('BOARDING PIER')}
              <select
                value={filters.pier}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    pier: event.target.value,
                  })
                }
              >
                <option value="">{t('All destinations')}</option>
                {[...new Set(catalog.map((boat) => boat.pier))].map((pier) => (
                  <option key={pier} value={pier}>
                    {t(pier)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              {t('DATE')}
              <input
                type="date"
                required
                min={N.localDate()}
                value={filters.date}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    date: event.target.value,
                  })
                }
              />
            </label>
            <label className="filter-field">
              {t('TIME OF DAY')}
              <select
                value={filters.slot}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    slot: event.target.value,
                  })
                }
              >
                {N.slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {t(slot)}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-field">
              <span id="guests-label">{t('GUESTS')}</span>
              <div className="stepper" role="group" aria-labelledby="guests-label">
                <button
                  type="button"
                  aria-label={t('Remove one guest')}
                  disabled={filters.guests === 1}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      guests: Math.max(1, filters.guests - 1),
                    })
                  }
                >
                  −
                </button>
                <output>
                  {t(filters.guests)} {t('guests')}
                </output>
                <button
                  type="button"
                  aria-label={t('Add one guest')}
                  disabled={filters.guests === 30}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      guests: Math.min(30, filters.guests + 1),
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>
            <button className="primary find" type="submit">
              {t('Find my escape')} <span aria-hidden="true">↗</span>
            </button>
          </form>
        </section>
        <section
          id="collection"
          ref={collectionRef}
          className="collection"
          aria-labelledby="fleet-title"
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('THE CURATED FLEET')}</p>
              <h2 id="fleet-title">{t('Good days start here.')}</h2>
            </div>
            <p role="status">
              {t(found.length)} {t('exceptional')} {found.length === 1 ? t('vessel') : t('vessels')}
            </p>
          </div>
          <div className="fleet-tools">
            <div className="chips" aria-label={t('Filter vessel type')}>
              {N.types.map((type) => (
                <button
                  key={type}
                  className={`chip ${filters.type === type ? 'selected' : ''}`}
                  aria-pressed={filters.type === type}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      type,
                    })
                  }
                >
                  {t(type)}
                </button>
              ))}
            </div>
            <span className="rate-note">
              {t('Seat reservations \xB7 1 hour \xB7 Captain included')}
            </span>
          </div>
          <div className="fleet">
            {catalogLoading ? (
              <p role="status">{t('Loading boats…')}</p>
            ) : catalogError ? (
              <div role="alert">
                {t(catalogError)}{' '}
                <button onClick={() => setCatalogRefresh((value) => value + 1)}>
                  {t('Retry')}
                </button>
              </div>
            ) : found.length ? (
              found.map((boat) => (
                <article className="boat-card" key={boat.id}>
                  <div className="vessel-art">
                    <BoatArt boat={boat} />
                    <span className="captain">{t('\u2713 CAPTAIN INCLUDED')}</span>
                  </div>
                  <div className="boat-content">
                    <div className="rating">
                      {boat.reviews > 0 ? (
                        <>
                          ★ {t(boat.rating)}
                          <span>
                            ({t(boat.reviews)} {t('reviews)')}
                          </span>
                        </>
                      ) : (
                        t('Approved vessel')
                      )}
                    </div>
                    <h3>{t(boat.name)}</h3>
                    <p className="location">
                      ⌖ {t(boat.pier)} {t('\xB7\xA0 Up to')} {t(boat.capacity)} {t('guests')}
                    </p>
                    <div className="amenities">
                      {boat.amenities.map((amenity) => (
                        <span key={amenity} className="amenity">
                          {t(amenity)}
                        </span>
                      ))}
                    </div>
                    <div className="card-bottom">
                      <div className="price">
                        {t(N.money(boat.fare, currency, locale))}
                        <small>{t('per group trip \xB7 1 hour')}</small>
                      </div>
                      <button
                        className="primary book"
                        onClick={(event) => book(boat, event)}
                        aria-label={t('Choose seats on {{v0}}', {
                          v0: t(boat.name),
                        })}
                      >
                        {t('Choose seats \u2197')}
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">
                <h3>{t('A little adjustment, a new possibility.')}</h3>
                <p>
                  {t(
                    catalog.length
                      ? 'No boats match these filters. Try another pier, fewer guests, or a different vessel type.'
                      : 'No approved boats are available yet.',
                  )}
                </p>
              </div>
            )}
          </div>
        </section>
        <section className="reassurance">
          {[
            ['A boat for every moment', 'From quiet mornings to something worth celebrating.'],
            [
              'Good hands, great journeys',
              'A dedicated captain and safety equipment on every trip.',
            ],
            ['Less planning, more living', 'Choose your extras. Keep your pass. Enjoy the water.'],
          ].map(([title, text], index) => (
            <div key={title}>
              <span>0{t(index + 1)}</span>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </div>
          ))}
        </section>
      </main>
      <footer>
        <Brand />
        <span>{t('Find a little more horizon.')}</span>
        <small>{t('Group trip fares · Indicative conversion ₹83 / USD')}</small>
      </footer>
      {authOpen && (
        <AuthDialog
          onSuccess={signedIn}
          onClose={() => {
            setAuthOpen(false);
            pendingAction.current = null;
            openerRef.current?.focus();
          }}
        />
      )}
      {flow && user && previousUser.current === user.id && (
        <BookingDialog
          flow={flow}
          user={user}
          passes={passes}
          currency={currency}
          onCurrency={toggleCurrency}
          onClose={closeFlow}
          onAuthExpired={() => {
            setFlow(null);
            setUser(null);
            setNotice('Your session expired. Sign in again to continue.');
          }}
          onBook={(booking) =>
            setPasses((previous) => [booking, ...previous.filter((pass) => pass.id !== booking.id)])
          }
        />
      )}
      {notice && (
        <div role="status" className="notice">
          {t(notice)}
        </div>
      )}
    </>
  );
}
