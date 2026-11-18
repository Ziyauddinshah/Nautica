import { useEffect, useRef, useState } from 'react';
import * as N from './domain/booking.js';
import { CURRENCY_KEY, PASSES_KEY, loadCurrency, loadPasses, savePass } from './lib/storage.js';
import BoatArt from './components/BoatArt.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import BookingDialog from './components/BookingDialog.jsx';

const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return N.localDate(date); };
function Brand() { return <a className="brand" href="./" aria-label="Nautica home"><span className="brand-icon" aria-hidden="true">⚓</span>Nautica<span className="brand-dot">.</span></a>; }

export default function App() {
  const [currency, setCurrency] = useState(loadCurrency);
  const [passes, setPasses] = useState(() => loadPasses().value);
  const [notice, setNotice] = useState(() => loadPasses().error || '');
  const [filters, setFilters] = useState(() => ({ pier: '', date: tomorrow(), slot: N.slots[0], type: N.types[0], guests: 2 }));
  const [flow, setFlow] = useState(null);
  const filtersRef = useRef(null);
  const collectionRef = useRef(null);
  const openerRef = useRef(null);
  const found = N.available(filters);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function changed(event) {
      if (event.key === PASSES_KEY || event.key === null) setPasses(loadPasses().value);
      if (event.key === CURRENCY_KEY || event.key === null) setCurrency(loadCurrency());
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function toggleCurrency() {
    const next = currency === 'INR' ? 'USD' : 'INR';
    setCurrency(next);
    try { localStorage.setItem(CURRENCY_KEY, JSON.stringify(next)); }
    catch { setNotice('Currency changed for this visit. Browser storage is unavailable.'); }
  }
  function openFlow(next, opener) { openerRef.current = opener; setFlow(next); }
  function closeFlow() { setFlow(null); openerRef.current?.focus(); }
  function book(boat, event) {
    if (!filtersRef.current.reportValidity()) return;
    if (filters.date < N.localDate()) { setNotice('Choose today or a future boarding date.'); return; }
    openFlow({ kind: 'booking', trip: { boatId: boat.id, date: filters.date, slot: filters.slot, guests: filters.guests, seats: [], extras: ['safety'] } }, event.currentTarget);
  }
  if(window.location.pathname.replace(/\/$/,'')==='/admin')return <AdminDashboard/>;
  return <>
    <header className="header"><Brand/><span className="header-note">LESS ORDINARY. MORE OPEN WATER.</span><nav aria-label="Main navigation"><a className="quiet admin-link" href="/admin">Admin</a><button className="quiet" onClick={toggleCurrency} aria-label={`Currency ${currency}. Switch to ${currency === 'INR' ? 'USD' : 'INR'}`}>{currency === 'INR' ? '₹ INR' : '$ USD'} ⇄</button><button className="outline" onClick={event => openFlow({ kind: 'passes' }, event.currentTarget)}>My passes <span className="count">{passes.filter(pass => pass.date >= N.localDate()).length}</span></button></nav></header>
    <main>
      <section className="hero"><div className="hero-copy"><p className="eyebrow"><span/> YOUR NEXT CHAPTER, ON THE WATER</p><h1>A different<br/>kind of <em>escape.</em></h1><p className="intro">Sunrise on the Ganges. Sunset on Lake Como.<br/>Find your boat. We’ll take care of the rest.</p><div className="hero-proof"><span>✧ Captain included</span><span>♡ Curated experiences</span><span>✓ Safety first</span></div></div><div className="hero-art" aria-label="Illustration of a sailboat on calm coastal water" role="img"><BoatArt boat={N.boats[0]}/></div><div className="hero-caption"><span>01 / THE OPEN WATER COLLECTION</span><span>Made for moments that stay with you ↗</span></div></section>
      <section className="search" aria-labelledby="search-title"><div className="search-heading"><h2 id="search-title">Where shall we take you?</h2><span>Your own boat. Your own pace.</span></div>
        <form id="filters" ref={filtersRef} onSubmit={event => { event.preventDefault(); collectionRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>
          <label className="filter-field">BOARDING PIER<select value={filters.pier} onChange={event => setFilters({ ...filters, pier: event.target.value })}><option value="">All destinations</option>{N.piers.map(pier => <option key={pier}>{pier}</option>)}</select></label>
          <label className="filter-field">DATE<input type="date" required min={N.localDate()} value={filters.date} onChange={event => setFilters({ ...filters, date: event.target.value })}/></label>
          <label className="filter-field">TIME OF DAY<select value={filters.slot} onChange={event => setFilters({ ...filters, slot: event.target.value })}>{N.slots.map(slot => <option key={slot}>{slot}</option>)}</select></label>
          <div className="filter-field"><span id="guests-label">GUESTS</span><div className="stepper" role="group" aria-labelledby="guests-label"><button type="button" aria-label="Remove one guest" disabled={filters.guests === 1} onClick={() => setFilters({ ...filters, guests: Math.max(1, filters.guests - 1) })}>−</button><output>{filters.guests} guests</output><button type="button" aria-label="Add one guest" disabled={filters.guests === 30} onClick={() => setFilters({ ...filters, guests: Math.min(30, filters.guests + 1) })}>+</button></div></div>
          <button className="primary find" type="submit">Find my escape <span aria-hidden="true">↗</span></button>
        </form>
      </section>
      <section id="collection" ref={collectionRef} className="collection" aria-labelledby="fleet-title"><div className="section-head"><div><p className="eyebrow">THE CURATED FLEET</p><h2 id="fleet-title">Good days start here.</h2></div><p role="status">{found.length} exceptional {found.length === 1 ? 'vessel' : 'vessels'}</p></div><div className="fleet-tools"><div className="chips" aria-label="Filter vessel type">{N.types.map(type => <button key={type} className={`chip ${filters.type === type ? 'selected' : ''}`} aria-pressed={filters.type === type} onClick={() => setFilters({ ...filters, type })}>{type}</button>)}</div><span className="rate-note">Seat reservations · 1 hour · Captain included</span></div>
        <div className="fleet">{found.length ? found.map(boat => <article className="boat-card" key={boat.id}><div className="vessel-art"><BoatArt boat={boat}/><span className="captain">✓ CAPTAIN INCLUDED</span></div><div className="boat-content"><div className="rating">★ {boat.rating}<span>({boat.reviews} reviews)</span></div><h3>{boat.name}</h3><p className="location">⌖ {boat.pier} &nbsp;·&nbsp; Up to {boat.capacity} guests</p><div className="amenities">{boat.amenities.map(amenity => <span key={amenity} className="amenity">{amenity}</span>)}</div><div className="card-bottom"><div className="price">{N.money(boat.fare, currency)}<small>per group trip · 1 hour</small></div><button className="primary book" onClick={event => book(boat, event)} aria-label={`Choose seats on ${boat.name}`}>Choose seats ↗</button></div></div></article>) : <div className="empty"><h3>A little adjustment, a new possibility.</h3><p>No boats match these filters. Try another pier, fewer guests, or a different vessel type.</p></div>}</div>
      </section>
      <section className="reassurance">{[['A boat for every moment', 'From quiet mornings to something worth celebrating.'], ['Good hands, great journeys', 'A dedicated captain and safety equipment on every trip.'], ['Less planning, more living', 'Choose your extras. Keep your pass. Enjoy the water.']].map(([title, text], index) => <div key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></div>)}</section>
    </main>
    <footer><Brand/><span>Find a little more horizon.</span><small>Local demo · Payments are simulated · Fixed ₹83 / USD rate</small></footer>
    {flow && <BookingDialog flow={flow} passes={passes} currency={currency} onCurrency={toggleCurrency} onClose={closeFlow} onBook={booking => { setPasses(previous=>[booking,...previous.filter(pass=>pass.id!==booking.id)]);try{savePass(booking);}catch{setNotice('Your booking is confirmed on the server, but the offline copy could not be saved. Download your pass now.');} }}/>}
    {notice && <div role="status" className="notice">{notice}</div>}
  </>;
}
