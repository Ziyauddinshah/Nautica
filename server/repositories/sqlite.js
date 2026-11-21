import {historyView,activeJourney,journeyEnd,historyCounts,paymentRow} from '../domain/history.js';
import {bookingView} from '../views.js';
// Legacy adapter retained for migration verification. Production uses MongoDB only.
import * as users from '../users.js';
import * as store from '../store.js';
import {notificationsFor} from '../email.js';
export function createSqliteRepository(db){
 users.initUsers(db);
 function history(id,query={}){
  const all=db.prepare('SELECT record FROM bookings WHERE user_id=? ORDER BY created_at DESC,id DESC').all(id).map(row=>JSON.parse(row.record)),counts=historyCounts(all),view=historyView(query),offset=Math.max(0,Math.min(1000000,parseInt(query.offset)||0));
  const filtered=all.filter(record=>view==='all'||(view==='upcoming'?activeJourney(record):!activeJourney(record)));
  if(view!=='all')filtered.sort((a,b)=>(view==='upcoming'?1:-1)*(journeyEnd(a)-journeyEnd(b)));
  return {all,counts,filtered,offset};
 }
 return {
  health:()=>{db.prepare('SELECT 1').get();},
  availability:input=>store.availability(db,input),
  createBooking:(input,mode,user)=>store.createBooking(db,input,mode,user),
  registerUser:input=>users.registerUser(db,input),loginUser:input=>users.loginUser(db,input),
  authenticateUser:token=>users.authenticateUser(db,token),
  userBookings:(id,query)=>{const h=history(id,query);return {bookings:h.filtered.slice(h.offset,h.offset+50).map(record=>({...bookingView(record,{notifications:notificationsFor(db,record.id)}),journeyState:activeJourney(record)?'upcoming':'previous'})),counts:h.counts,paymentTotal:h.all.length,total:h.filtered.length,upcoming:h.counts.upcoming,offset:h.offset,limit:50};},
  userPayments:(id,query)=>{const h=history(id,query),rows=h.all.map(record=>paymentRow(record));return {payments:rows.slice(h.offset,h.offset+50),counts:h.counts,total:rows.length,paymentTotal:rows.length,offset:h.offset,limit:50};},userBooking:(id,booking)=>users.userBooking(db,id,booking),
  changeUserPassword:(id,input)=>users.changeUserPassword(db,id,input),
  requestPasswordReset:(input,settings)=>users.requestPasswordReset(db,input,settings),resetUserPassword:input=>users.resetUserPassword(db,input),
  loginAdmin:(name,password)=>store.login(db,name,password),authenticateAdmin:token=>store.authenticate(db,token),
  adminBookings:query=>store.adminBookings(db,query),notificationsFor:id=>notificationsFor(db,id),
  hasBooking:id=>Boolean(db.prepare('SELECT id FROM bookings WHERE id=?').get(id)),
  logoutUser:token=>db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(store.digest(token)),
  logoutAdmin:token=>db.prepare('DELETE FROM sessions WHERE token_hash=?').run(store.digest(token)),
 };
}
