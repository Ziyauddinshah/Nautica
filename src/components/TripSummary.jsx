import { amounts, extras, money, seatText } from '../domain/booking.js';
export function TripSummary({ boat, trip }) {
  return <div className="trip-summary"><strong>{boat.name}</strong><p>{boat.pier}<br/>{trip.date} · {trip.slot}<br/>{trip.guests} guests · Private trip · 1 hour<br/>Seats: {seatText(boat, trip.seats)}</p></div>;
}
export function PriceBreakdown({ boat, trip, currency }) {
  const price = amounts(boat, trip.extras);
  return <div className="breakdown"><div className="money-row"><span>Private vessel fare</span><span>{money(price.base, currency)}</span></div>
    {extras.filter(extra => trip.extras.includes(extra.id)).map(extra => <div className="money-row" key={extra.id}><span>{extra.name}</span><span>{extra.price ? money(extra.price, currency) : 'Included'}</span></div>)}
    <div className="money-row"><span>Port & pier fee · 5%</span><span>{money(price.fee, currency)}</span></div><div className="money-row total"><span>Grand total</span><span>{money(price.total, currency)}</span></div>
  </div>;
}
