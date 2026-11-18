import { useState } from 'react';
import { boats, extras, money, seatText } from '../domain/booking.js';
import { downloadFile, passFile, shareFile } from '../lib/passExport.js';
import QrCode from './QrCode.jsx';

export default function BoardingPass({ booking, currency, confirmed, onExplore }) {
  const [notice, setNotice] = useState('');
  const boat = boats.find(item => item.id === booking.boatId);
  const fields = [['VESSEL', boat.name], ['BOARDING PIER', boat.pier], ['DATE', booking.date], ['DEPARTURE', booking.slot], ['GUESTS', `${booking.guests} passengers`], ['TOTAL PAID', money(booking.total, currency)]];
  async function share() {
    try { const shared = await shareFile(passFile(booking, currency)); if (!shared) setNotice('Pass downloaded. Attach it to WhatsApp or email to share.'); }
    catch (error) { if (error.name !== 'AbortError') setNotice('Sharing is unavailable. Use Download pass instead.'); }
  }
  function download() { try { downloadFile(passFile(booking, currency)); } catch { setNotice('Pass export failed. Try Print / Save as PDF.'); } }
  return <>
    {confirmed && <div className="success-icon" aria-hidden="true">✓</div>}
    <p className="steps">{confirmed ? '03 / READY TO SET SAIL' : 'YOUR SAVED VOYAGE'}</p><h2 id="flow-title" className="dialog-title">{confirmed ? 'Booking confirmed.' : 'Your boarding pass.'}</h2><p className="subtitle">Saved in this browser. Ready whenever you are.</p>
    {booking.emailStatus==='requested' && <p className="demo-note">An email confirmation has been requested for you and the admin. Your booking remains confirmed even if email delivery is delayed.</p>}
    {!booking.serverConfirmed && <p className="demo-note">Legacy local demo pass — not registered in the current server seat inventory.</p>}
    <div className="ticket"><div className="ticket-head"><strong>⚓ NAUTICA</strong><span>DIGITAL BOARDING PASS</span></div><div className="ticket-main"><p className="eyebrow">{booking.id}</p><h3>{booking.name}</h3>
      <div className="ticket-grid">{fields.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}<div className="ticket-seats"><small>SEAT NUMBERS</small><strong>{seatText(boat, booking.seats)}</strong></div></div>
      <div className="perforation"/><p className="demo-note">{extras.filter(extra => booking.extras.includes(extra.id)).map(extra => extra.name).join(' · ')}</p>
      <QrCode value={JSON.stringify({ ...booking, vessel: boat.name, pier: boat.pier })}/>
      <p className="method">{booking.method}</p><p className="demo-note">Arrive 15 minutes before boarding.<br/>Demo pass · Not valid for real travel</p>
    </div></div>
    <div className="no-print"><button className="primary wide" onClick={() => window.print()}>Print / Save as PDF</button><div className="two-fields"><button className="outline" onClick={download}>Download pass</button><button className="outline" onClick={share}>Share pass</button></div>{notice && <p role="status" className="demo-note">{notice}</p>}<button className="back-link" onClick={onExplore}>Explore more voyages →</button></div>
  </>;
}
