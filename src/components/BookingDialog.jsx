import { useEffect, useRef, useState } from 'react';
import * as N from '../domain/booking.js';
import SeatMap from './SeatMap.jsx';
import { TripSummary, PriceBreakdown } from './TripSummary.jsx';
import PaymentForm, { emptyDraft } from './PaymentForm.jsx';
import BoardingPass from './BoardingPass.jsx';

export default function BookingDialog({ flow, passes, currency, onCurrency, onClose, onBook }) {
  const dialogRef = useRef(null);
  const timerRef = useRef(null);
  const payLock = useRef(false);
  const [stage, setStage] = useState(flow.kind === 'booking' ? 'review' : flow.kind);
  const [trip, setTrip] = useState(flow.trip || null);
  const [activePass, setActivePass] = useState(flow.booking || null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState('');
  const boat = trip && N.boats.find(item => item.id === trip.boatId);
  const processing = stage === 'processing';
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return () => { clearTimeout(timerRef.current); dialog.close(); };
  }, []);
  useEffect(() => { dialogRef.current.scrollTop = 0; }, [stage]);
  function close() { if (!payLock.current) { dialogRef.current.close(); onClose(); } }
  function proceed() {
    if (!N.validSeats(boat, trip.seats, trip.guests)) {
      setError(`Please choose ${trip.guests} seats, one for each guest, before continuing.`);
      dialogRef.current.querySelector('.seat-button')?.focus();
      return;
    }
    setError(''); setStage('payment');
  }
  function pay(name, method) {
    if (payLock.current) return;
    if (trip.date < N.localDate()) { setError('This boarding date has passed. Please choose a new trip.'); return; }
    if (!N.validSeats(boat, trip.seats, trip.guests)) { setError('Choose one valid seat for each guest.'); return; }
    const booking = { id: `NTC-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`, boatId: boat.id, date: trip.date, slot: trip.slot, guests: trip.guests, seats: [...trip.seats].sort(), name, extras: [...trip.extras], total: N.amounts(boat, trip.extras).total, currencyBase: 'INR', method };
    payLock.current = true; setStage('processing'); setError('');
    timerRef.current = setTimeout(() => {
      try { onBook(booking); setActivePass(booking); setDraft(emptyDraft()); setStage('confirmed'); }
      catch { setError('Could not save your pass. Check browser storage settings and try again. No booking was completed.'); setStage('payment'); }
      finally { payLock.current = false; }
    }, 2000);
  }
  return <dialog id="flow" ref={dialogRef} aria-labelledby="flow-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-top"><span className="small-brand">⚓ NAUTICA</span><button className="quiet" disabled={processing} onClick={onCurrency} aria-label="Switch currency">{currency === 'INR' ? '₹ INR' : '$ USD'} ⇄</button><button className="icon-button" disabled={processing} onClick={close} aria-label="Close booking">✕</button></div>
    <div id="flow-body">
      {stage === 'review' && <>
        <p className="steps">01 / YOUR VOYAGE</p><h2 id="flow-title" className="dialog-title">Make it yours.</h2><p className="subtitle">A few thoughtful touches for a memorable trip.</p>
        <TripSummary boat={boat} trip={trip}/><SeatMap boat={boat} guests={trip.guests} selected={trip.seats} error={error} onChange={seats => { setTrip({ ...trip, seats }); setError(''); }}/>
        <div className="extras">{N.extras.map(extra => <label className="addon" key={extra.id}><input type="checkbox" checked={trip.extras.includes(extra.id)} disabled={extra.id === 'safety'} onChange={event => setTrip({ ...trip, extras: event.target.checked ? [...trip.extras, extra.id] : trip.extras.filter(id => id !== extra.id) })}/><span className="addon-text"><strong>{extra.name}</strong><small>{extra.detail}</small></span><span>{extra.price ? `+ ${N.money(extra.price, currency)}` : 'Included'}</span></label>)}</div>
        <PriceBreakdown boat={boat} trip={trip} currency={currency}/><button className="primary wide" onClick={proceed}>Proceed to payment · {N.money(N.amounts(boat, trip.extras).total, currency)} →</button><p className="demo-note">One private vessel, one flat fare. Your captain is included.</p>
      </>}
      {stage === 'payment' && <PaymentForm boat={boat} trip={trip} currency={currency} draft={draft} onDraft={setDraft} onPay={pay} onBack={() => { setError(''); setStage('review'); }} error={error}/>}
      {processing && <div className="processing" role="status"><div className="spinner"/><h2 id="flow-title" className="dialog-title">A moment, then the horizon.</h2><p className="subtitle">Simulating secure payment processing…</p></div>}
      {stage === 'passes' && <><p className="steps">YOUR JOURNEYS</p><h2 id="flow-title" className="dialog-title">My boarding passes.</h2><p className="subtitle">Stored on this browser, on this device. Available offline.</p><div className="pass-list">{passes.length ? passes.map(pass => <button key={pass.id} className="saved-pass" onClick={() => { setActivePass(pass); setStage('pass'); }}><strong>{N.boats.find(boat => boat.id === pass.boatId).name}</strong><small>{pass.date} · {pass.slot}<br/>{pass.id} · {pass.guests} guests · {N.money(pass.total, currency)}</small></button>) : <div className="empty"><h3>Your horizon is waiting.</h3><p>Your first boarding pass will appear here after booking.</p></div>}</div></>}
      {(stage === 'confirmed' || stage === 'pass') && <BoardingPass booking={activePass} currency={currency} confirmed={stage === 'confirmed'} onExplore={close}/>}
    </div>
  </dialog>;
}
