// Legacy adapter retained for migration verification. Production uses MongoDB only.
import * as users from '../users.js';
import * as store from '../store.js';
import {notificationsFor} from '../email.js';
export function createSqliteRepository(db){
 users.initUsers(db);
 return {
  health:()=>{db.prepare('SELECT 1').get();},
  availability:input=>store.availability(db,input),
  createBooking:(input,mode,user)=>store.createBooking(db,input,mode,user),
  registerUser:input=>users.registerUser(db,input),loginUser:input=>users.loginUser(db,input),
  authenticateUser:token=>users.authenticateUser(db,token),
  userBookings:(id,query)=>users.userBookings(db,id,query),userBooking:(id,booking)=>users.userBooking(db,id,booking),
  changeUserPassword:(id,input)=>users.changeUserPassword(db,id,input),
  requestPasswordReset:(input,settings)=>users.requestPasswordReset(db,input,settings),resetUserPassword:input=>users.resetUserPassword(db,input),
  loginAdmin:(name,password)=>store.login(db,name,password),authenticateAdmin:token=>store.authenticate(db,token),
  adminBookings:query=>store.adminBookings(db,query),notificationsFor:id=>notificationsFor(db,id),
  hasBooking:id=>Boolean(db.prepare('SELECT id FROM bookings WHERE id=?').get(id)),
  logoutUser:token=>db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(store.digest(token)),
  logoutAdmin:token=>db.prepare('DELETE FROM sessions WHERE token_hash=?').run(store.digest(token)),
 };
}
