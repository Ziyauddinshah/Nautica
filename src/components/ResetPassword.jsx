import { useState } from 'react';
import { request } from '../lib/api.js';
import { AuthForm } from './AuthForm.jsx';

export default function ResetPassword({token,onUser}){
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[invalid,setInvalid]=useState(!token);
 async function submit(event){event.preventDefault();setError('');if(password!==confirmation){setError('New passwords do not match.');return;}setBusy(true);
  try{await request('/api/user/reset-password',{method:'POST',body:{token,newPassword:password}});setPassword('');setConfirmation('');setDone(true);onUser(null);}
  catch(error){setError(error.message);if(error.status===400&&/link/i.test(error.message))setInvalid(true);}finally{setBusy(false);}
 }
 const login=next=>{onUser(next);window.location.assign('/account');};
 return <><header className="header"><a className="brand" href="/">⚓ Nautica<span className="brand-dot">.</span></a><a className="outline" href="/account">Back to account</a></header><main className="account-main"><section className="account-login">
  {done?<AuthForm onSuccess={login} message="Password updated. All devices have been signed out. Sign in with your new password."/>:invalid?<><p className="error" role="alert">This reset link is missing, invalid or expired. Request a new one below.</p><AuthForm initialMode="forgot" onSuccess={login}/></>:<><p className="eyebrow">ACCOUNT RECOVERY</p><h1 className="dialog-title">Choose a new password.</h1><p className="subtitle">No current password is needed. This link expires 15 minutes after it was requested and can be used once.</p><form onSubmit={submit}><label className="field">New password<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label className="field">Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>{error&&<p className="error" role="alert">{error}</p>}<button type="submit" className="primary wide" disabled={busy}>{busy?'Updating password…':'Reset password'}</button></form></>}
 </section></main></>;
}
