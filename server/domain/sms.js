/** @file Pure validation and public data rules for sms. */
import { translate } from '../../src/i18n/catalog.js';
const clean = (value) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
export function bookingSms(record, audience) {
  const hi = record.language === 'hi',
    t = (value) => translate(value, {}, hi ? 'hi' : 'en');
  const amount = (record.payment.amount / 100).toFixed(2),
    seats = record.trip.seats.join(',');
  const parts = hi
    ? [
        audience === 'admin' ? 'Nautica: नई बुकिंग' : 'Nautica: बुकिंग पुष्ट',
        record.id,
        t(record.boat.name),
        record.trip.date,
        t(record.trip.slot),
        'सीटें ' + seats,
        'INR ' + amount,
        record.payment.status === 'demo_paid'
          ? 'डेमो भुगतान; वास्तविक शुल्क नहीं'
          : 'भुगतान प्राप्त',
        '15 मिनट पहले घाट पहुँचें: ' + t(record.boat.pier),
      ]
    : [
        audience === 'admin' ? 'Nautica: new booking' : 'Nautica: booking confirmed',
        record.id,
        record.boat.name,
        record.trip.date,
        record.trip.slot,
        'Seats ' + seats,
        'INR ' + amount,
        record.payment.status === 'demo_paid' ? 'DEMO payment; no real charge' : 'Payment received',
        'Arrive 15 min early at ' + record.boat.pier,
      ];
  // Omit contact, full payment reference, account/security data and reset links.
  const message = parts.map(clean).join('\n');
  return hi ? message : message.replace(/[·–—]/g, '-');
}
