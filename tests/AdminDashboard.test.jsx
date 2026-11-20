import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../src/components/AdminDashboard.jsx';
import * as N from '../src/domain/booking.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('admin login protects the manifest, shows complete booking details, and logout clears access',async()=>{
 let authenticated=false;
 const record={id:'NTC-ADMIN-TEST',status:'confirmed',createdAt:'2026-11-18T10:00:00Z',bookingMode:'seats',customer:{name:'Admin Visible Guest',email:'private@example.com',phone:'+919876543210'},boat:N.boats[0],trip:{date:'2027-01-15',slot:N.slots[0],guests:2,seats:['01','02']},extras:['safety'],pricing:N.amounts(N.boats[0],['safety']),notifications:[{audience:'customer',status:'failed',attempts:1,errorCode:'SMTP_AUTH_FAILED'},{audience:'admin',status:'sent',attempts:1,sentAt:'2026-11-18T10:01:00Z'}],payment:{status:'demo_paid',method:'VISA · 4242',reference:'DEMO-TEST-REFERENCE',paidAt:'2026-11-18T10:00:00Z',amount:126000}};
 vi.mocked(fetch).mockImplementation(async(path,options={})=>{
  if(path==='/api/admin/session')return json({error:'Sign in'},401);
  if(path==='/api/admin/login'){const body=JSON.parse(options.body);if(body.password!=='test-password-long')return json({error:'Invalid admin username or password.'},401);authenticated=true;return json({username:body.username});}
  if(path==='/api/admin/logout'){authenticated=false;return json({ok:true});}
  if(path.endsWith('/emails/retry')&&authenticated){record.notifications[0]={audience:'customer',status:'pending',attempts:0};return json({ok:true});}
  if(path.startsWith('/api/admin/bookings')&&authenticated)return json({bookings:[record],total:1,offset:0,limit:50,emailService:{configured:true,adminRecipient:'admin@example.test'}});
  return json({error:'Sign in'},401);
 });
 render(<AdminDashboard/>);await screen.findByRole('button',{name:'Sign in as admin'});
 expect(screen.queryByText(/private@example.com/)).toBeNull();
 fireEvent.change(screen.getByLabelText('Admin username'),{target:{value:'admin'}});fireEvent.change(screen.getByLabelText('Admin password'),{target:{value:'wrong'}});fireEvent.click(screen.getByRole('button',{name:'Sign in as admin'}));
 expect((await screen.findByRole('alert')).textContent).toMatch(/Invalid/);
 fireEvent.change(screen.getByLabelText('Admin password'),{target:{value:'test-password-long'}});fireEvent.click(screen.getByRole('button',{name:'Sign in as admin'}));
 await screen.findByRole('button',{name:'View booking NTC-ADMIN-TEST'});expect(screen.getByRole('table').textContent).toContain('private@example.com');
 fireEvent.click(screen.getByRole('button',{name:'View booking NTC-ADMIN-TEST'}));
 await screen.findByRole('button',{name:'Seat 01, booked by Admin Visible Guest'});expect(screen.getByText('DEMO-TEST-REFERENCE')).toBeTruthy();expect(screen.getAllByText('+919876543210').length).toBeGreaterThan(0);
 expect(screen.getAllByText('Customer: failed').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Retry failed emails'}));await screen.findAllByText('Customer: pending');expect(record.notifications[1].status).toBe('sent');
 expect(localStorage.length).toBe(0);
 fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await screen.findByRole('button',{name:'Sign in as admin'});expect(screen.queryByText(/private@example.com/)).toBeNull();expect(authenticated).toBe(false);
});
