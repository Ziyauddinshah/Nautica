import { useState } from 'react';
import { seatLayout } from '../domain/booking.js';

export default function SeatMap({ boat, guests, selected, onChange, error }) {
  const [message, setMessage] = useState('');
  const seats = seatLayout(boat);
  const columns = boat.type === 'Party pontoon' ? 4 : 2;
  const rows = Array.from({ length: Math.ceil(boat.capacity / columns) }, (_, index) => seats.filter(seat => seat.row === index));
  function toggle(id) {
    if (selected.includes(id)) onChange(selected.filter(seat => seat !== id));
    else if (selected.length < guests) onChange([...selected, id]);
    else { setMessage(`You have chosen all ${guests} seats. Deselect one before choosing another.`); return; }
    setMessage('');
  }
  return <section className="seat-section" aria-labelledby="seat-title">
    <div className="seat-heading"><div><h3 id="seat-title">Choose your spot on board.</h3><p>Select {guests} seat{guests === 1 ? '' : 's'}, one for each guest.</p></div><span className="seat-count">{selected.length} / {guests}</span></div>
    <div className="seat-legend"><span><i/> Available</span><span><i className="selected"/> Your seats</span><span>Private charter</span></div>
    <div className={`seat-board ${columns === 4 ? 'pontoon' : 'pointed'}`} role="group" aria-label={`${boat.name} numbered seating plan. Front at top, rear at bottom.`}>
      <svg className="boat-outline" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true"><path d={columns === 4 ? 'M75 12Q180 -2 285 12Q340 20 340 65V590Q340 625 305 625H55Q20 625 20 590V65Q20 20 75 12Z' : 'M180 8Q328 72 337 235L326 585Q326 624 290 628H70Q34 624 34 585L23 235Q32 72 180 8Z'} fill={boat.type === 'Wooden boat' ? '#f6eee0' : '#e6eff0'} stroke={boat.tone} strokeWidth="6"/><path d="M58 242V568Q58 600 86 600H274Q302 600 302 568V242" fill="none" stroke={boat.tone} strokeOpacity=".2" strokeWidth="2"/></svg>
      <div className="boat-front">↑ FRONT / BOW</div><div className="captain-position"><span aria-hidden="true">☸</span> Captain <small>Not a passenger seat</small></div>
      <div className="seat-sides"><span>PORT · LEFT</span><span>RIGHT · STARBOARD</span></div>
      <div className="seat-rows">{rows.map((row, index) => <div key={index} className={`seat-row cols-${columns} ${row.length === 1 ? 'single-seat' : ''}`}>
        {row.map(seat => <button key={seat.id} type="button" className={`seat-button ${selected.includes(seat.id) ? 'is-selected' : ''}`} style={{ gridColumn: columns === 4 && seat.column >= 2 ? seat.column + 2 : seat.column + 1 }} aria-pressed={selected.includes(seat.id)} aria-label={`Seat ${seat.id}, ${seat.zone.toLowerCase()}, ${seat.side.toLowerCase()}`} onClick={() => toggle(seat.id)}>{seat.id}</button>)}
      </div>)}</div><div className="boat-rear">REAR / STERN</div>
    </div>
    <p className="seat-status" role="status" aria-live="polite">{message || (selected.length === guests ? 'All guests have a seat. Deselect one to change your choice.' : `Choose ${guests - selected.length} more seat${guests - selected.length === 1 ? '' : 's'}.`)}</p>
    <button type="button" className="outline wide" onClick={() => { onChange(seats.slice(0, guests).map(seat => seat.id)); setMessage(''); }}>Choose seats for me</button>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="seat-disclaimer">Illustrative seating plan. Your captain will confirm the actual layout. Seats are preferences within your private boat booking.</p>
  </section>;
}
