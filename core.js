/* Shared, dependency-free booking and validation rules. Amounts are INR paise. */
(function(root){
'use strict';
const piers=['Assi Ghat','Dashashwamedh Ghat','Marina Bay','Lake Como'];
const types=['All vessels','Wooden boat','Motor yacht','Party pontoon','Speedboat'];
const slots=['Sunrise · 5:30 AM','Morning · 9:00 AM','Sunset · 5:00 PM','Evening · 7:30 PM'];
const boats=[
{id:'b1',name:'Ganges Dawn',pier:piers[0],type:types[1],capacity:6,fare:120000,rating:'4.9',reviews:128,amenities:['Canopy shade','Life jackets'],tone:'#b57b4d'},
{id:'b2',name:'River Reverie',pier:piers[0],type:types[3],capacity:24,fare:650000,rating:'4.8',reviews:96,amenities:['Bluetooth audio','Canopy shade'],tone:'#366b72'},
{id:'b3',name:'Sacred Current',pier:piers[1],type:types[1],capacity:8,fare:160000,rating:'4.9',reviews:214,amenities:['Heritage route','Life jackets'],tone:'#ad734a'},
{id:'b4',name:'Aarti Voyager',pier:piers[1],type:types[3],capacity:30,fare:850000,rating:'4.8',reviews:173,amenities:['Bluetooth audio','Life jackets'],tone:'#4e7184'},
{id:'b5',name:'Marina Eclipse',pier:piers[2],type:types[2],capacity:12,fare:4150000,rating:'5.0',reviews:84,amenities:['Sun deck','Private lounge'],tone:'#2c4e68'},
{id:'b6',name:'Bay Sprint',pier:piers[2],type:types[4],capacity:6,fare:1245000,rating:'4.7',reviews:62,amenities:['Coastal tour','Life jackets'],tone:'#467a7d'},
{id:'b7',name:'Bellagio Pearl',pier:piers[3],type:types[2],capacity:10,fare:4980000,rating:'4.9',reviews:116,amenities:['Sun deck','Bluetooth audio'],tone:'#365970'},
{id:'b8',name:'Como Riva',pier:piers[3],type:types[4],capacity:5,fare:2075000,rating:'4.9',reviews:91,amenities:['Villa route','Life jackets'],tone:'#99684d'}];
const extras=[{id:'safety',name:'Extra life vests & safety kit',price:0,detail:'Peace of mind, always included.'},{id:'snacks',name:'Refreshments & snacks',price:40000,detail:'A little something for the journey.'},{id:'photo',name:'Professional photographer',price:150000,detail:'Keep the memories, beautifully.'},{id:'guide',name:'Local heritage guide',price:80000,detail:'Discover the stories along the shore.'}];
function money(paise,currency){return new Intl.NumberFormat(currency==='USD'?'en-US':'en-IN',{style:'currency',currency}).format(paise/(currency==='USD'?8300:100));}
function amounts(boat,selected){const addons=extras.filter(e=>selected.includes(e.id)).reduce((s,e)=>s+e.price,0);const fee=Math.round((boat.fare+addons)*.05);return {base:boat.fare,addons,fee,total:boat.fare+addons+fee};}
function network(number){if(/^4/.test(number))return 'VISA';if(/^(34|37)/.test(number))return 'AMEX';if(/^(5[1-5])/.test(number)||(+number.slice(0,4)>=2221&&+number.slice(0,4)<=2720))return 'MASTERCARD';if(/^(60|65|81|82)/.test(number))return 'RUPAY';return 'CARD';}
function card(number){if(!/^\d{13,19}$/.test(number)||new Set(number).size<2)return false;return [...number].reverse().reduce((s,c,i)=>{let n=+c*(i%2?2:1);return s+(n>9?n-9:n);},0)%10===0;}
function expiry(value,now=new Date()){if(!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value))return false;let [m,y]=value.split('/').map(Number);return 2000+y>now.getFullYear()||(2000+y===now.getFullYear()&&m>=now.getMonth()+1);}
function upi(value){return /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/.test(value.trim());}
function cvv(number,value){return (network(number)==='AMEX'?/^\d{4}$/:/^\d{3}$/).test(value);}
function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function available(filters){return boats.filter(b=>(!filters.pier||b.pier===filters.pier)&&(filters.type===types[0]||b.type===filters.type)&&b.capacity>=filters.guests);}
// Numbered passenger seats; the captain is separate from the advertised capacity.
function seatLayout(boat){
 const columns=boat.type==='Party pontoon'?4:2;
 const rowCount=Math.ceil(boat.capacity/columns);
 return Array.from({length:boat.capacity},(_,index)=>{
  const row=Math.floor(index/columns),inRow=Math.min(columns,boat.capacity-row*columns);
  const column=columns===4&&inRow===2?(index%columns===0?0:3):index%columns;
  return {id:String(index+1).padStart(2,'0'),row,column,
   side:inRow===1?'Center':column<columns/2?'Port (left)':'Starboard (right)',
   zone:rowCount===1?'Front':row===0?'Front':row===rowCount-1?'Rear':'Middle'};
 });
}
function validSeats(boat,seats,guests){
 if(!Array.isArray(seats)||!Number.isInteger(guests)||guests<1||guests>boat.capacity||seats.length!==guests||new Set(seats).size!==seats.length)return false;
 const ids=new Set(seatLayout(boat).map(seat=>seat.id));
 return seats.every(id=>ids.has(id));
}
function seatText(boat,seats){
 if(!Array.isArray(seats))return 'Not selected';
 const ids=new Set(seatLayout(boat).map(seat=>seat.id));
 const selected=[...new Set(seats.filter(id=>ids.has(id)))].sort();
 return selected.length?selected.join(', '):'Not selected';
}
const api={piers,types,slots,boats,extras,money,amounts,network,card,expiry,upi,cvv,localDate,available,seatLayout,validSeats,seatText};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Nautica=api;
})(typeof window!=='undefined'?window:globalThis);
