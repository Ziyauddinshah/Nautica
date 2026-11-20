import {useEffect,useState} from 'react';

// Reload server records on return to the page and periodically while visible.
// This carries no account data and never writes private records to browser storage.
export default function useBackgroundRefresh(enabled,intervalMs=15000){
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!enabled)return;
  const refresh=()=>{if(document.visibilityState!=='hidden')setRevision(value=>value+1);};
  window.addEventListener('focus',refresh);
  window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange',refresh);
  const timer=setInterval(refresh,intervalMs);
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[enabled,intervalMs]);
 return revision;
}
