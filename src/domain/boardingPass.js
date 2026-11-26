/** @file Public UI constants and presentation rules for boardingPass. */
import { boats, seatLayout } from './booking.js';

// Boarding scans need trip identity and positions, not passenger contact/payment/security data.
export function boardingQrPayload(booking) {
  const boat = booking.boat || boats.find((boat) => boat.id === booking.boatId);
  const valid = new Set(boat ? seatLayout(boat).map((seat) => seat.id) : []);
  return JSON.stringify({
    version: 1,
    bookingId: booking.id,
    boatId: booking.boatId,
    date: booking.date,
    slot: booking.slot,
    guests: booking.guests,
    seats: Array.isArray(booking.seats)
      ? [...new Set(booking.seats.filter((id) => valid.has(id)))].sort()
      : [],
  });
}
