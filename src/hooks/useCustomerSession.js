import { useCallback,useEffect,useRef,useState } from 'react';
import { request } from '../lib/api.js';

export function clearLegacyPassCache(){try{localStorage.removeItem('nautica.web.passes');return true;}catch{return false;}}
export default function useCustomerSession(){
 const [user,setUser]=useState(undefined),channel=useRef(null),sequence=useRef(0);
 const refresh=useCallback(async()=>{const current=++sequence.current;try{const result=await request('/api/user/session');if(current===sequence.current)setUser(result.user);}catch(error){if(current===sequence.current){if(error.status===401)setUser(null);else setUser(previous=>previous===undefined?null:previous);}}},[]);
 useEffect(()=>{
  refresh();
  if(typeof BroadcastChannel!=='undefined'){channel.current=new BroadcastChannel('nautica-user-session');channel.current.onmessage=()=>refresh();}
  const focus=()=>refresh();window.addEventListener('focus',focus);
  const interval=setInterval(()=>{if(document.visibilityState==='visible')refresh();},60000);
  return()=>{sequence.current++;window.removeEventListener('focus',focus);clearInterval(interval);channel.current?.close();channel.current=null;};
 },[refresh]);
 const update=useCallback(next=>{sequence.current++;setUser(next);channel.current?.postMessage('changed');},[]);
 return {user,setUser:update,refresh};
}
