import * as N from '../domain/booking.js';
import { qrSvg } from './qr.js';
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function passFile(p,currency){const b=N.boats.find(b=>b.id===p.boatId),qr=qrSvg(JSON.stringify({...p,vessel:b.name,pier:b.pier})),svgBytes=new TextEncoder().encode(qr),qrData='data:image/svg+xml;base64,'+btoa(Array.from(svgBytes,c=>String.fromCharCode(c)).join(''));
const seatIds=N.seatText(b,p.seats).split(', '),seatLines=[];for(let i=0;i<seatIds.length;i+=12)seatLines.push((i?'Seats (cont.): ':'Seats: ')+seatIds.slice(i,i+12).join(', '));
const text=[p.id,p.name,b.name,b.pier,p.date,p.slot,`${p.guests} guests · ${N.money(p.total,currency)}`,p.method,...seatLines,...N.extras.filter(e=>p.extras.includes(e.id)).map(e=>e.name)];const rows=text.map((s,i)=>`<text x="45" y="${130+i*29}" font-size="${i===1?22:14}" fill="#0a192f">${escapeHtml(s)}</text>`).join('');
const divider=Math.max(485,130+(text.length-1)*29+30),qrY=divider+25,footerY=qrY+280,height=footerY+55;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="${height}" viewBox="0 0 620 ${height}"><rect width="620" height="${height}" fill="#f4f7f9"/><rect x="20" y="20" width="580" height="${height-40}" rx="20" fill="white"/><path d="M40 20h540q20 0 20 20v45H20V40q0-20 20-20" fill="#0a192f"/><text x="45" y="61" font-family="sans-serif" font-size="23" fill="white">NAUTICA · BOARDING PASS</text><g font-family="sans-serif">${rows}<path d="M40 ${divider}H580" stroke="#bdcdce" stroke-dasharray="8 6"/><image x="190" y="${qrY}" width="240" height="240" href="${qrData}"/><text x="45" y="${footerY}" font-size="12" fill="#65737e">Arrive 15 minutes early · Demo pass · Not valid for travel</text></g></svg>`;
return new File([svg],p.id+'.svg',{type:'image/svg+xml'});}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Nautica boarding pass', files: [file] });
    return true;
  }
  downloadFile(file);
  return false;
}
