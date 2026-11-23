import {smsStatusText} from '../lib/smsStatus.js';
import useBackgroundRefresh from '../hooks/useBackgroundRefresh.js';
import LanguageSwitcher, { useI18n } from "../i18n/I18nProvider.jsx";
import { useEffect, useState } from 'react';
import { request } from '../lib/api.js';
import * as N from '../domain/booking.js';
export default function AdminDashboard() {
  const {
    t,
    locale
  } = useI18n();
  const [session, setSession] = useState(undefined),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const backgroundRefresh=useBackgroundRefresh(Boolean(session));
  const [filters, setFilters] = useState({
      q: '',
      boatId: '',
      date: '',
      slot: ''
    }),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({
      bookings: [],
      total: 0
    }),
    [selected, setSelected] = useState(null),
    [manifest, setManifest] = useState([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    request('/api/admin/session').then(result => {
      if (active) setSession(result);
    }).catch(error => {
      if (active) {
        setSession(null);
        if (error.status !== 401) setError(error.message);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(()=>{setData({bookings:[],total:0});setSelected(null);},[session,filters,offset]);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      ...filters,
      offset
    });
    request('/api/admin/bookings?' + query, {
      signal: controller.signal
    }).then(result=>{if(controller.signal.aborted)return;setData(result);setSelected(current=>current?(result.bookings.find(record=>record.id===current.id)||current):null);}).catch(error => {
      if (error.name !== 'AbortError') {
        setError(error.message);
        if (error.status === 401) setSession(null);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session, filters, offset, refresh, backgroundRefresh]);
  useEffect(()=>{setManifest([]);},[selected?.boat.id,selected?.trip.date,selected?.trip.slot]);
  useEffect(() => {
    if (!selected) {
      setManifest([]);
      return;
    }
    const controller = new AbortController();
    request('/api/admin/bookings?' + new URLSearchParams({
      boatId: selected.boat.id,
      date: selected.trip.date,
      slot: selected.trip.slot
    }), {
      signal: controller.signal
    }).then(data => {if(controller.signal.aborted)return;setManifest(data.bookings);setSelected(current=>current?.id===selected.id?(data.bookings.find(record=>record.id===current.id)||current):current);}).catch(error => {
      if (error.name !== 'AbortError') setError(error.message);
    });
    return () => controller.abort();
  }, [selected?.id,selected?.boat.id,selected?.trip.date,selected?.trip.slot,backgroundRefresh,refresh]);
  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/admin/login', {
        method: 'POST',
        body: {
          username,
          password
        }
      });
      setPassword('');
      setSession(result);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await request('/api/admin/logout', {
        method: 'POST',
        body: {}
      });
      setSession(null);
      setData({
        bookings: [],
        total: 0
      });
      setSelected(null);
      setManifest([]);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function retryEmails(record,channel='email') {
    setBusy(true);
    setError('');
    try {
      await request(`/api/admin/bookings/${record.id}/${channel==='sms'?'sms':'emails'}/retry`, {
        method: 'POST',
        body: {}
      });
      setRefresh(value => value + 1);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const setFilter = (key, value) => {
    setOffset(0);
    setFilters(previous => ({
      ...previous,
      [key]: value
    }));
  };
  return <><header className="header"><LanguageSwitcher /><a className="brand" href="/">{t("\u2693 Nautica")}<span className="brand-dot">.</span></a><span className="header-note">{t("BOOKINGS & SEAT MANIFEST")}</span><nav><a className="outline" href="/">{t("Customer app")}</a>{session && <button className="quiet" disabled={busy} onClick={signOut}>{t("Sign out")}</button>}</nav></header>
    <main className="admin-main">
      {session === undefined ? <p role="status">{t("Checking admin session\u2026")}</p> : !session ? <section className="admin-login"><p className="eyebrow">{t("ADMIN ACCESS")}</p><h1>{t("Welcome aboard.")}</h1><p className="subtitle">{t("Sign in to view passenger, seat, boat and payment records.")}</p><form onSubmit={signIn}><label className="field">{t("Admin username")}<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required maxLength={80} /></label><label className="field">{t("Admin password")}<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={256} /></label><button type="submit" className="primary wide" disabled={busy}>{busy ? t('Signing in…') : t('Sign in as admin')}</button></form><p className="demo-note">{t("Use the administrator credentials provided to you.")}</p></section> : <>
        <p className="eyebrow">{t("SIGNED IN AS")} {t(session.username)}</p><div className="section-head"><h1 className="admin-title">{t("Booking overview")}</h1><button className="outline" onClick={() => setRefresh(value => value + 1)}>{t("Refresh bookings")}</button></div><p className="subtitle">{t("Review bookings, passenger details and payment records.")}</p>
        {data.emailService && <p className="demo-note" role="status">{data.emailService.configured ? t('Email notifications are available.') : t('Email notifications are currently unavailable. Contact your system administrator.')}</p>}
        <form className="admin-filters" onSubmit={event => event.preventDefault()}><label className="field">{t("Search passenger or reference")}<input type="search" value={filters.q} onChange={event => setFilter('q', event.target.value)} placeholder={t("Name, email, phone, booking ID")} /></label><label className="field">{t("Boat")}<select value={filters.boatId} onChange={event => setFilter('boatId', event.target.value)}><option value="">{t("All boats")}</option>{N.boats.map(boat => <option key={boat.id} value={boat.id}>{t(boat.name)} · {t(boat.pier)}</option>)}</select></label><label className="field">{t("Trip date")}<input type="date" value={filters.date} onChange={event => setFilter('date', event.target.value)} /></label><label className="field">{t("Time slot")}<select value={filters.slot} onChange={event => setFilter('slot', event.target.value)}><option value="">{t("All time slots")}</option>{N.slots.map(slot => <option key={slot} value={slot}>{t(slot)}</option>)}</select></label></form>
        <p role="status">{loading ? t('Loading bookings…') : t("{{v0}} matching bookings \xB7 Showing {{v1}} on this page", {
            v0: t(data.total),
            v1: t(data.bookings.length)
          })}</p>
        {data.paymentAttention?.length>0&&<section className="admin-detail"><h2>{t('Payment issues requiring attention')}</h2><p>{t('Payment received; refund required. Contact the customer and issue a refund through Razorpay Dashboard.')}</p>{data.paymentAttention.map(payment=><p key={payment.id}>{payment.name} · {payment.email} · {payment.phone}<br/>{payment.paymentId} · {N.money(payment.amount,'INR',locale)}</p>)}</section>}
        <div className="admin-table-wrap"><table className="admin-table"><caption>{t("Booked seats and passenger records")}</caption><thead><tr>{['Booking', 'Passenger', 'Boat / pier', 'Trip', 'Seats', 'Payment', 'Notifications', 'Details'].map(title => <th scope="col" key={title}>{t(title)}</th>)}</tr></thead><tbody>{data.bookings.map(record => <tr key={record.id}><td><strong>{record.id}</strong><small>{t(record.status)}<br />{t(new Date(record.createdAt).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN"))}</small></td><td>{record.customer.name}<small>{record.customer.email}<br />{record.customer.phone}</small></td><td>{t(record.boat.name)}<small>{t(record.boat.type)}<br />{t(record.boat.pier)}</small></td><td>{t(record.trip.date)}<small>{t(record.trip.slot)}<br />{t(record.trip.guests)} {t("guests")}</small></td><td>{t(record.trip.seats.join(', '))}</td><td>{t(N.money(record.payment.amount, 'INR', locale))}<small>{t(record.payment.method)}<br />{t(record.payment.status)}</small></td><td><NotificationStatus notifications={record.notifications} /></td><td><button className="outline" onClick={() => setSelected(record)} aria-label={t("View booking {{v0}}", {
                    v0: record.id
                  })}>{t("View details")}</button></td></tr>)}</tbody></table>{!loading && !data.bookings.length && <p className="empty">{t("No bookings match these filters.")}</p>}</div>
        <div className="admin-pagination"><button className="outline" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{t("Previous")}</button><span>{t("Page")} {t(Math.floor(offset / 50) + 1)}</span><button className="outline" disabled={offset + 50 >= data.total || loading} onClick={() => setOffset(value => value + 50)}>{t("Next")}</button></div>
        {selected && <section className="admin-detail" aria-labelledby="booking-detail-title"><p className="eyebrow">{t("BOOKING DETAIL")}</p><h2 id="booking-detail-title">{selected.id}</h2><div className="admin-detail-grid"><Detail title={t("Passenger")} values={{
              'Lead guest': selected.customer.name,
              Email: selected.customer.email,
              Phone: selected.customer.phone,
              Guests: selected.trip.guests
            }} /><Detail title={t("Boat and seats")} values={{
              Vessel: selected.boat.name,
              Type: selected.boat.type,
              Pier: selected.boat.pier,
              Capacity: selected.boat.capacity,
              Date: selected.trip.date,
              Time: selected.trip.slot,
              Seats: selected.trip.seats.join(', '),
              'Reservation mode': selected.bookingMode
            }} /><Detail title={t("Payment summary")} values={{
              Status: selected.payment.status,
              Method: selected.payment.method,
              Reference: selected.payment.reference,
              'Paid at': selected.payment.paidAt,
              'Base fare': N.money(selected.pricing.base, 'INR', locale),
              Extras: N.money(selected.pricing.addons, 'INR', locale),
              'Port fee': N.money(selected.pricing.fee, 'INR', locale),
              Total: N.money(selected.payment.amount, 'INR', locale)
            }} /><Detail title={t("Booking information")} values={{
              Status: selected.status,
              Created: selected.createdAt,
              'Add-ons': N.extras.filter(extra => selected.extras.includes(extra.id)).map(extra => extra.name).join(', ')
            }} /></div>
          <section className="admin-email-detail"><h3>{t("Confirmation emails")}</h3><NotificationStatus notifications={selected.notifications?.filter(item=>item.channel!=='sms')} />{selected.notifications?.some(item => item.channel!=='sms'&&item.status === 'failed') && <button className="outline" disabled={busy || !data.emailService?.configured} onClick={() => retryEmails(selected)}>{t("Retry failed emails")}</button>}<p className="demo-note">{t("Customer and admin messages are tracked separately. Failed sends retry automatically up to five times; sent messages are not resent by this button.")}</p></section>
          <section className="admin-email-detail"><h3>{t('SMS confirmations')}</h3><NotificationStatus notifications={selected.notifications?.filter(item=>item.channel==='sms')}/>{selected.notifications?.some(item=>item.channel==='sms'&&item.retryable)&&<button className="outline" disabled={busy||!data.smsService?.configured} onClick={()=>retryEmails(selected,'sms')}>{t('Retry rejected SMS')}</button>}<p className="demo-note">{t('Accepted does not mean delivered. Unknown sends are not automatically resent; check provider history before retrying.')}</p></section>
          <h3>{t("Seat manifest \xB7")} {t(selected.boat.name)}</h3><p className="subtitle">{t(selected.trip.date)} · {t(selected.trip.slot)}{t(". Select a booked seat to view its passenger\u2019s booking.")}</p><div className="admin-manifest">{N.seatLayout(selected.boat).map(seat => {
              const owner = manifest.find(record => record.trip.seats.includes(seat.id));
              return <button key={seat.id} className={`manifest-seat ${owner ? 'occupied' : ''} ${owner?.id === selected.id ? 'current' : ''}`} disabled={!owner} aria-label={t("Seat {{v0}}, {{v1}}", {
                v0: seat.id,
                v1: owner ? 'booked by ' + owner.customer.name : 'available'
              })} title={owner ? t("{{v0}} \xB7 {{v1}}", {
                v0: owner.customer.name,
                v1: owner.id
              }) : t('Available')} onClick={() => setSelected(owner)}><strong>{seat.id}</strong><small>{owner ? owner.customer.name : t('Available')}</small></button>;
            })}</div>
        </section>}
      </>}
      {error && <p className="error" role="alert">{t(error)}</p>}
    </main></>;
}
function Detail({
  title,
  values
}) {
  const {
    t,
    locale
  } = useI18n();
  return <section><h3>{t(title)}</h3><dl>{Object.entries(values).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{['Name','Email','Phone','Lead guest','Reference','Booking ID'].includes(label)?value:t(value)}</dd></div>)}</dl></section>;
}
function NotificationStatus({
  notifications
}) {
  const {
    t,
    locale
  } = useI18n();
  if (!notifications?.length) return <small>{t("Not queued (older booking)")}</small>;
  return <div className="email-status">{notifications.map(item => <div key={(item.channel||'email')+':'+item.audience}><strong>{item.channel==='sms'?t(item.audience==='customer'?'Customer SMS':'Admin SMS'):item.audience === 'customer' ? t('Customer') : t('Admin')}: {item.channel==='sms'?t(smsStatusText(item.status)):item.status === 'sent' ? t('Sent') : t(item.status)}</strong><small>{t("Attempts:")} {t(item.attempts)}{item.sentAt ? t(" \xB7 {{v0}}", {
          v0: t(new Date(item.sentAt).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN"))
        }) : ''}</small></div>)}</div>;
}
