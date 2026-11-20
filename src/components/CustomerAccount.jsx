import useBackgroundRefresh from '../hooks/useBackgroundRefresh.js';
import LanguageSwitcher, { useI18n } from "../i18n/I18nProvider.jsx";
import { useEffect, useState } from 'react';
import { clearLegacyPassCache } from '../hooks/useCustomerSession.js';
import { request } from '../lib/api.js';
import { money } from '../domain/booking.js';
import { AuthForm } from './AuthForm.jsx';
import BookingDialog from './BookingDialog.jsx';
const paymentStatusText = status => ({
  demo_paid: 'Demo payment recorded',
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded'
})[status] || 'Status unavailable';
const emailStatusText = status => ({
  pending: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Delivery delayed'
})[status] || 'Not requested';
export default function CustomerAccount({
  user,
  onUser,
  currency,
  onCurrency
}) {
  const {
    t,
    locale
  } = useI18n();
  const backgroundRefresh=useBackgroundRefresh(Boolean(user));
  const [data, setData] = useState({
      bookings: [],
      total: 0
    }),
    [offset, setOffset] = useState(0),
    [tab, setTab] = useState('bookings'),
    [selected, setSelected] = useState(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [message, setMessage] = useState('');
  const [passwords, setPasswords] = useState({
      currentPassword: '',
      newPassword: '',
      confirmation: ''
    }),
    [busy, setBusy] = useState(false);
  useEffect(()=>{setData({bookings:[],total:0});setSelected(null);},[user?.id,offset]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request('/api/user/bookings?' + new URLSearchParams({
      offset
    }), {
      signal: controller.signal
    }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(error => {
      if (error.name !== 'AbortError') {
        setError(error.message);
        if (error.status === 401) onUser(null);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [user?.id, offset, refresh, backgroundRefresh]);
  async function logout() {
    setBusy(true);
    try {
      await request('/api/user/logout', {
        method: 'POST',
        body: {}
      });
      setSelected(null);
      setData({
        bookings: [],
        total: 0
      });
      onUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event) {
    event.preventDefault();
    setError('');
    if (passwords.newPassword !== passwords.confirmation) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await request('/api/user/password', {
        method: 'POST',
        body: {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        }
      });
      setPasswords({
        currentPassword: '',
        newPassword: '',
        confirmation: ''
      });
      setData({
        bookings: [],
        total: 0
      });
      setSelected(null);
      setMessage('Password updated. Sign in again with your new password.');
      onUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <><header className="header"><LanguageSwitcher /><a className="brand" href="/">{t("\u2693 Nautica")}<span className="brand-dot">.</span></a><nav><a className="outline" href="/">{t("Explore boats")}</a><button className="quiet" onClick={onCurrency} aria-label={t("Switch currency")}>{t(currency)} ⇄</button>{user && <button className="quiet" disabled={busy} onClick={logout}>{t("Sign out")}</button>}</nav></header><main className="account-main">
  {user === undefined ? <p role="status">{t("Checking your session\u2026")}</p> : !user ? <div className="account-login"><AuthForm onSuccess={next => {
          setMessage('');
          onUser(next);
        }} message={message} /></div> : <>
   <p className="eyebrow">{t("YOUR ACCOUNT")}</p><div className="section-head"><h1 className="admin-title">{t("Hello,")} {user.name}.</h1><button className="outline" onClick={() => setRefresh(value => value + 1)}>{t("Refresh history")}</button></div>
   <section className="account-profile" aria-label={t("Your profile")}><div><small>{t("EMAIL")}</small><strong>{user.email}</strong></div><div><small>{t("PHONE")}</small><strong>{user.phone}</strong></div><div><small>{t("MEMBER SINCE")}</small><strong>{new Date(user.createdAt).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN")}</strong></div><div><small>{t("YOUR BOOKINGS")}</small><strong>{t(data.total)}</strong></div></section>
   <div className="tabs" role="tablist" aria-label={t("Account sections")}>{[['bookings', 'Booking history'], ['payments', 'Payment history'], ['security', 'Account security']].map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(label)}</button>)}</div>
   {loading && <p role="status">{t("Loading your history\u2026")}</p>}
   {tab === 'bookings' && <section><h2>{t("Booking history")}</h2><p className="subtitle">{t("Your reservations, trip details and boarding passes are listed here.")}</p><div className="account-bookings">{data.bookings.map(record => <article key={record.id} className="account-booking"><div className="section-head"><div><p className="eyebrow">{record.id}</p><h3>{t(record.boat.name)}</h3></div><span className="booking-status">{t(record.status)}</span></div><p>{t(record.boat.pier)}<br />{t(record.trip.date)} · {t(record.trip.slot)}<br />{t(record.trip.guests)} {t("guests \xB7 Seats")} {t(record.trip.seats.join(', '))}</p><div className="money-row"><span>{t(paymentStatusText(record.payment.status))}</span><strong>{t(money(record.payment.amount, currency, locale))}</strong></div><small>{t("Booked")} {t(new Date(record.createdAt).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN"))} {t("\xB7 Confirmation email:")} {t(emailStatusText(record.notifications?.[0]?.status))}</small><button className="primary wide" onClick={() => setSelected(record.pass)}>{t("View boarding pass")}</button></article>)}</div>{!loading && !data.bookings.length && <p className="empty">{t("No bookings yet. Choose a boat to plan your first trip.")}</p>}</section>}
   {tab === 'payments' && <section><h2>{t("Payment history")}</h2><p className="subtitle">{t("Payment records show the status reported for each booking.")}</p>{data.payments?.map(payment=><p className="demo-note" role="status" key={payment.id}>{money(payment.amount,'INR',locale)} · {t(payment.status==='refund_required'?'Payment received but seats could not be confirmed. Contact support for a refund.':'Payment is awaiting confirmation. Check your booking history before retrying.')} {payment.reference}</p>)}<div className="admin-table-wrap"><table className="admin-table"><caption>{t("Your payment records")}</caption><thead><tr>{['Booking', 'Vessel', 'Method', 'Status', 'Amount', 'Reference / date'].map(title => <th key={title} scope="col">{t(title)}</th>)}</tr></thead><tbody>{data.bookings.map(record => <tr key={record.id}><td>{record.id}</td><td>{t(record.boat.name)}</td><td>{t(record.payment.method)}</td><td>{t(paymentStatusText(record.payment.status))}</td><td>{t(money(record.payment.amount, currency, locale))}</td><td>{record.payment.reference}<small>{t(new Date(record.payment.paidAt).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN"))}</small></td></tr>)}</tbody></table></div>{!loading && !data.bookings.length && <p className="empty">{t("No payment records yet.")}</p>}</section>}
   {tab === 'security' && <section className="account-security"><h2>{t("Change password")}</h2><p className="subtitle">{t("Changing your password signs out all devices, including this session.")}</p><form onSubmit={changePassword}><label className="field">{t("Current password")}<input type="password" autoComplete="current-password" required maxLength={256} value={passwords.currentPassword} onChange={event => setPasswords({
                ...passwords,
                currentPassword: event.target.value
              })} /></label><label className="field">{t("New password")}<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={passwords.newPassword} onChange={event => setPasswords({
                ...passwords,
                newPassword: event.target.value
              })} /></label><label className="field">{t("Confirm new password")}<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={passwords.confirmation} onChange={event => setPasswords({
                ...passwords,
                confirmation: event.target.value
              })} /></label><button className="primary" type="submit" disabled={busy}>{t("Change password and sign out")}</button></form><hr /><h3>{t("Older browser pass copies")}</h3><p className="subtitle">{t("You can remove older pass copies saved on this device. Your account bookings will remain available.")}</p><button className="outline" onClick={() => {
            if (window.confirm('Remove older pass copies saved on this device? Your account bookings will remain available.')) setMessage(clearLegacyPassCache() ? 'Old browser pass copies cleared.' : 'Browser storage could not be cleared.');
          }}>{t("Clear old browser pass copies")}</button></section>}
   {tab !== 'security' && <div className="admin-pagination"><button className="outline" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{t("Previous")}</button><span>{t("Page")} {t(Math.floor(offset / 50) + 1)}</span><button className="outline" disabled={offset + 50 >= data.total || loading} onClick={() => setOffset(value => value + 50)}>{t("Next")}</button></div>}
  </>}{user && message && <p className="demo-note" role="status">{t(message)}</p>}{error && <p className="error" role="alert">{t(error)}</p>}
 </main>{selected && user && <BookingDialog flow={{
      kind: 'pass',
      booking: selected
    }} passes={[]} currency={currency} onCurrency={onCurrency} onClose={() => setSelected(null)} />}</>;
}
