import { useEffect,useRef,useState } from 'react';
import { request } from '../lib/api.js';

export function AuthForm({onSuccess,message=''}){
 const [mode,setMode]=useState('login'),[values,setValues]=useState({name:'',phone:'',email:'',password:'',confirmation:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=(key,value)=>{setValues(previous=>({...previous,[key]:value}));setError('');};
 async function submit(event){event.preventDefault();setError('');if(mode==='register'&&values.password!==values.confirmation){setError('Passwords do not match.');return;}setBusy(true);
  try{const {user}=await request(`/api/user/${mode}`,{method:'POST',body:mode==='login'?{email:values.email,password:values.password}:{name:values.name,email:values.email,phone:values.phone,password:values.password}});setValues({name:'',phone:'',email:'',password:'',confirmation:''});onSuccess(user);}
  catch(error){setError(error.message);}finally{setBusy(false);}
 }
 return <section className="customer-auth"><p className="eyebrow">YOUR NAUTICA ACCOUNT</p><h2 id="auth-title" className="dialog-title">{mode==='login'?'Welcome back.':'Your next horizon starts here.'}</h2><p className="subtitle">{message||'Sign in to book seats and view your booking and payment history.'}</p><form onSubmit={submit}>
  {mode==='register'&&<><label className="field">Full name<input value={values.name} onChange={event=>change('name',event.target.value)} autoComplete="name" minLength={2} maxLength={80} required/></label><label className="field">Phone number<input type="tel" value={values.phone} onChange={event=>change('phone',event.target.value)} autoComplete="tel" maxLength={25} required/></label></>}
  <label className="field">Email address<input type="email" value={values.email} onChange={event=>change('email',event.target.value)} autoComplete="email" maxLength={150} required/></label>
  <label className="field">Password<input type="password" value={values.password} onChange={event=>change('password',event.target.value)} aria-describedby={mode==='register'?'registration-password-help':undefined} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='register'?12:1} maxLength={256} required/></label>{mode==='register'&&<p className="demo-note" id="registration-password-help">Use at least 12 characters. A unique passphrase is a good choice.</p>}
  {mode==='register'&&<label className="field">Confirm password<input type="password" value={values.confirmation} onChange={event=>change('confirmation',event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required/></label>}
  {error&&<p className="error" role="alert">{error}</p>}<button className="primary wide" type="submit" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}</button>
 </form><button className="back-link" disabled={busy} onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setValues(previous=>({...previous,password:'',confirmation:''}));}}>{mode==='login'?'New here? Create an account':'Already registered? Sign in'}</button></section>;
}
export default function AuthDialog({onSuccess,onClose}){
 const ref=useRef(null);useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} aria-labelledby="auth-title" onCancel={event=>{event.preventDefault();onClose();}}><div className="dialog-top"><span className="small-brand">⚓ NAUTICA</span><button className="icon-button" aria-label="Close sign in" onClick={onClose}>✕</button></div><div className="auth-dialog-body"><AuthForm onSuccess={onSuccess}/></div></dialog>;
}
