import { useI18n } from "../i18n/I18nProvider.jsx";
import { useState } from 'react';
import { boats, extras, money, seatText } from '../domain/booking.js';
import { downloadFile, passFile, shareFile } from '../lib/passExport.js';
import { boardingQrPayload } from '../domain/boardingPass.js';
import QrCode from './QrCode.jsx';
export default function BoardingPass({
  booking,
  currency,
  confirmed,
  onExplore
}) {
  const {
    t,
    locale
  } = useI18n();
  const [notice, setNotice] = useState('');
  const boat = boats.find(item => item.id === booking.boatId);
  const fields = [['VESSEL', boat.name], ['BOARDING PIER', boat.pier], ['DATE', booking.date], ['DEPARTURE', booking.slot], ['GUESTS', `${booking.guests} ${t("passengers")}`], ['TOTAL PAID', money(booking.total, currency, locale)]];
  async function share() {
    try {
      const shared = await shareFile(passFile(booking, currency,locale));
      if (!shared) setNotice('Pass downloaded. Attach it to WhatsApp or email to share.');
    } catch (error) {
      if (error.name !== 'AbortError') setNotice('Sharing is unavailable. Use Download pass instead.');
    }
  }
  function download() {
    try {
      downloadFile(passFile(booking, currency,locale));
    } catch {
      setNotice('Pass export failed. Try Print / Save as PDF.');
    }
  }
  return <>
    {confirmed && <div className="success-icon" aria-hidden="true">✓</div>}
    <p className="steps">{confirmed ? t('03 / READY TO SET SAIL') : t('YOUR SAVED VOYAGE')}</p><h2 id="flow-title" className="dialog-title">{confirmed ? t('Booking confirmed.') : t('Your boarding pass.')}</h2><p className="subtitle">{t("View your pass here or download it for your trip.")}</p>
    {booking.emailStatus === 'requested' && <p className="demo-note">{t("Your booking is confirmed. View email and SMS status in My account.")}</p>}
    {!booking.serverConfirmed && <p className="demo-note">{t("This older demo pass may need confirmation before use.")}</p>}
    <div className="ticket"><div className="ticket-head"><strong>{t("\u2693 NAUTICA")}</strong><span>{t("DIGITAL BOARDING PASS")}</span></div><div className="ticket-main"><p className="eyebrow">{booking.id}</p><h3>{booking.name}</h3>
      <div className="ticket-grid">{fields.map(([label, value]) => <div key={label}><small>{t(label)}</small><strong>{t(value)}</strong></div>)}<div className="ticket-seats"><small>{t("SEAT NUMBERS")}</small><strong>{t(seatText(boat, booking.seats))}</strong></div></div>
      <div className="perforation" /><p className="demo-note">{t(extras.filter(extra => booking.extras.includes(extra.id)).map(extra => t(extra.name)).join(' · '))}</p>
      <QrCode value={boardingQrPayload(booking)} />
      <p className="method">{t(booking.method)}</p><p className="demo-note">{t("Arrive 15 minutes before boarding.")}<br />{booking.paymentStatus==='paid'?'':t('Demo pass · Not valid for real travel')}</p>
    </div></div>
    <div className="no-print"><button className="primary wide" onClick={() => window.print()}>{t("Print / Save as PDF")}</button><div className="two-fields"><button className="outline" onClick={download}>{t("Download pass")}</button><button className="outline" onClick={share}>{t("Share pass")}</button></div>{notice && <p role="status" className="demo-note">{t(notice)}</p>}<button className="back-link" onClick={onExplore}>{t("Explore more voyages \u2192")}</button></div>
  </>;
}
