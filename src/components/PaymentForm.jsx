import { useRef, useState } from 'react';
import * as N from '../domain/booking.js';
import { PriceBreakdown, TripSummary } from './TripSummary.jsx';
import QrCode from './QrCode.jsx';

export const banks = ['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Bank of Baroda', 'Canara Bank', 'Kotak Mahindra', 'Punjab National Bank', 'Union Bank'];
export const emptyDraft = () => ({ name: '', email: '', phone: '', upi: '', number: '', holder: '', expiry: '', cvv: '', bank: '', tab: 'upi', app: 'GPay' });
export function validatePayment(draft, tab) {
  if (draft.name.trim().length < 2) return ['name', 'Enter the lead guest’s full name.'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return ['email', 'Enter a valid email address.'];
  if (!/^\+?[\d ()-]{7,25}$/.test(draft.phone.trim()) || draft.phone.replace(/\D/g, '').length < 7 || draft.phone.replace(/\D/g, '').length > 15) return ['phone', 'Enter a valid contact phone number.'];
  if (tab === 'upi' && !N.upi(draft.upi)) return ['upi', 'Enter a valid UPI ID, for example alex@okaxis.'];
  if (tab === 'card') {
    if (!N.card(draft.number)) return ['number', 'Enter a valid card number. Use the test card shown above.'];
    if (draft.holder.trim().length < 2) return ['holder', 'Enter the cardholder name.'];
    if (!N.expiry(draft.expiry)) return ['expiry', 'Enter a valid, unexpired date in MM/YY format.'];
    if (!N.cvv(draft.number, draft.cvv)) return ['cvv', N.network(draft.number) === 'AMEX' ? 'Amex requires a four-digit CVV.' : 'Enter a three-digit CVV.'];
  }
  if (tab === 'bank' && !banks.includes(draft.bank)) return ['bank', 'Choose your bank before continuing.'];
  return null;
}

export default function PaymentForm({ boat, trip, currency, draft, onDraft, onPay, onBack, error, accountEmail }) {
  const tab = draft.tab;
  const app = draft.app;
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(null);
  const formRef = useRef(null);
  const patch = (key, value) => { onDraft({ ...draft, [key]: value }); setInvalid(null); };
  function submit(event) {
    event.preventDefault();
    const problem = validatePayment(draft, tab);
    if (problem) { setInvalid(problem); formRef.current.elements.namedItem(problem[0])?.focus(); return; }
    onPay({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), payment: tab === 'upi' ? { type: tab, provider: app } : tab === 'card' ? { type: tab, network: N.network(draft.number), last4: draft.number.slice(-4) } : { type: tab, bank: draft.bank } });
  }
  function changeTab(next) { onDraft({ ...draft, tab: next, cvv: '' }); setInvalid(null); }
  const fieldProps = key => ({ name: key, value: draft[key], 'aria-invalid': invalid?.[0] === key || undefined, onChange: event => patch(key, event.target.value) });
  return <>
    <p className="steps">02 / CHECKOUT</p><h2 id="flow-title" className="dialog-title">One step closer.</h2><p className="subtitle">Demo checkout. No money will be charged.</p>
    <TripSummary boat={boat} trip={trip}/>
    <form ref={formRef} onSubmit={submit} noValidate>
      <label className="field">Lead guest name<input {...fieldProps('name')} autoComplete="name" maxLength={80} placeholder="Your full name"/></label>
      <div className="two-fields"><label className="field">Email address<input {...fieldProps('email')} readOnly={!!accountEmail} type="email" autoComplete="email" maxLength={150} placeholder="you@example.com"/></label><label className="field">Phone number<input {...fieldProps('phone')} type="tel" autoComplete="tel" maxLength={25} placeholder="+91 98765 43210"/></label></div>
      <div className="tabs" role="tablist" aria-label="Payment method">{[['upi', 'UPI / QR'], ['card', 'Credit / Debit'], ['bank', 'Net banking']].map(([id, title], index, all) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-controls="payment-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => changeTab(id)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = all[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3][0];
        changeTab(next); document.getElementById(`tab-${next}`)?.focus();
      }}>{title}</button>)}</div>
      <div id="payment-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'upi' && <>
          <QrCode value={`NAUTICA-DEMO-PAYMENT:${boat.id}:${N.amounts(boat, trip.extras).total}`} label="Demo payment preview QR code"/>
          <p className="demo-note">Demo QR preview — not a payable UPI request</p>
          <div className="app-options">{['GPay', 'PhonePe', 'Paytm', 'BHIM'].map(name => <button type="button" key={name} className={`chip ${app === name ? 'selected' : ''}`} aria-pressed={app === name} onClick={() => onDraft({ ...draft, app: name })}>{name}</button>)}</div>
          <label className="field">UPI ID<input {...fieldProps('upi')} autoComplete="off" maxLength={100} placeholder="username@bank" autoCapitalize="none" spellCheck={false}/></label>
        </>}
        {tab === 'card' && <>
          <div className="virtual-card" aria-label="Card preview"><div className="card-brand"><span>NAUTICA</span><strong>{N.network(draft.number)}</strong></div><div className="card-digits">{draft.number.match(/.{1,4}/g)?.join(' ') || '••••  ••••  ••••  ••••'}</div><div className="card-person"><span>{draft.holder.toUpperCase() || 'CARDHOLDER NAME'}</span><span>{draft.expiry || 'MM/YY'}</span></div></div>
          <label className="field">Card number<input name="number" value={draft.number.match(/.{1,4}/g)?.join(' ') || ''} aria-invalid={invalid?.[0] === 'number' || undefined} onChange={event => patch('number', event.target.value.replace(/\D/g, '').slice(0, 19))} inputMode="numeric" autoComplete="off" maxLength={23} placeholder="4242 4242 4242 4242"/><small>Test card: 4242 4242 4242 4242 · use a future expiry</small></label>
          <label className="field">Cardholder name<input {...fieldProps('holder')} autoComplete="off" maxLength={80} placeholder="Name on your card"/></label>
          <div className="two-fields"><label className="field">Expiry<input name="expiry" value={draft.expiry} aria-invalid={invalid?.[0] === 'expiry' || undefined} onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); patch('expiry', digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits); }} inputMode="numeric" autoComplete="off" maxLength={5} placeholder="MM/YY"/></label><label className="field">CVV<input name="cvv" value={draft.cvv} aria-invalid={invalid?.[0] === 'cvv' || undefined} onChange={event => patch('cvv', event.target.value.replace(/\D/g, '').slice(0, 4))} type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="•••"/></label></div>
        </>}
        {tab === 'bank' && <>
          <div className="bank-options">{banks.slice(0, 4).map(bank => <button type="button" key={bank} className={`bank ${draft.bank === bank ? 'selected' : ''}`} aria-pressed={draft.bank === bank} onClick={() => patch('bank', bank)}>{bank}</button>)}</div>
          <label className="field">Other banks<select {...fieldProps('bank')}><option value="">Choose a bank</option>{banks.map(bank => <option key={bank}>{bank}</option>)}</select></label>
          <label className="field">Search banks<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by bank name"/></label>
          {query.trim() && <div className="bank-options">{banks.filter(bank => bank.toLowerCase().includes(query.toLowerCase())).map(bank => <button type="button" key={bank} className={`bank ${draft.bank === bank ? 'selected' : ''}`} aria-pressed={draft.bank === bank} onClick={() => patch('bank', bank)}>{bank}</button>)}{!banks.some(bank => bank.toLowerCase().includes(query.toLowerCase())) && <p className="demo-note">No matching banks.</p>}</div>}
          <p className="demo-note">{draft.bank ? `Selected: ${draft.bank}` : 'Choose a bank to continue.'}</p>
        </>}
      </div>
      <PriceBreakdown boat={boat} trip={trip} currency={currency}/>
      {(invalid || error) && <p className="error" role="alert">{invalid?.[1] || error}</p>}
      <button className="primary wide" type="submit">{tab === 'upi' ? 'Verify & pay' : 'Confirm demo payment'} · {N.money(N.amounts(boat, trip.extras).total, currency)}</button>
      <button className="back-link" type="button" onClick={onBack}>← Back to your extras</button>
      <p className="demo-note">Simulation only. Card details and UPI IDs are never saved.<br/>Fixed demonstration exchange rate: ₹83 / USD.</p>
    </form>
  </>;
}
