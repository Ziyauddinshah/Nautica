import React from 'react';
import {test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import CustomerAccount from '../src/components/CustomerAccount.jsx';
import AdminDashboard from '../src/components/AdminDashboard.jsx';
import {boats,slots,amounts} from '../src/domain/booking.js';
const json=data=>new Response(JSON.stringify(data));
const user={id:'sms-user',name:'Guest',email:'guest@example.test',phone:'+919876543210',createdAt:'2026-11-23T00:00:00Z'};
const record={id:'NTC-ABCDEF123456',status:'confirmed',createdAt:'2026-11-23T00:00:00Z',customer:user,boat:boats[0],trip:{date:'2026-12-01',slot:slots[0],guests:1,seats:['01']},extras:['safety'],pricing:amounts(boats[0],['safety']),payment:{status:'demo_paid',method:'UPI',amount:126000},notifications:[{audience:'customer',channel:'sms',status:'accepted',attempts:1},{audience:'customer',status:'sent',attempts:1}]};
test('customer SMS acceptance is not described as delivered or confused with email status',async()=>{
 vi.mocked(fetch).mockResolvedValue(json({bookings:[record],total:1}));render(<CustomerAccount user={user} onUser={()=>{}} currency="INR" onCurrency={()=>{}}/>);
 await screen.findByText(/Confirmation SMS:/);expect(screen.getByText(/Confirmation SMS:/).textContent).toContain('Accepted by gateway');expect(screen.getByText(/Confirmation email:/).textContent).toContain('Sent');expect(screen.queryByText('Delivered')).toBeNull();
});
test('admin retry routes rejected SMS separately from email and never presents unknown sends as retryable',async()=>{
 const smsRecord={...record,notifications:[{audience:'customer',channel:'sms',status:'unknown',attempts:1,retryable:false},{audience:'admin',channel:'sms',status:'failed',attempts:1,retryable:true},{audience:'customer',status:'failed',attempts:1}]};
 vi.mocked(fetch).mockImplementation(async(path,options={})=>path==='/api/admin/session'?json({username:'admin'}):path.endsWith('/sms/retry')?json({ok:true}):json({bookings:[smsRecord],total:1,emailService:{configured:true},smsService:{configured:true}}));
 render(<AdminDashboard/>);await screen.findByRole('button',{name:'View booking '+record.id});fireEvent.click(screen.getByRole('button',{name:'View booking '+record.id}));
 await screen.findByRole('button',{name:'Retry rejected SMS'});expect(screen.getByRole('button',{name:'Retry failed emails'})).toBeTruthy();expect(screen.getAllByText(/Outcome unknown/).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Retry rejected SMS'}));await waitFor(()=>expect(fetch.mock.calls.some(([path])=>path.endsWith('/sms/retry'))).toBe(true));expect(fetch.mock.calls.some(([path])=>path.endsWith('/emails/retry'))).toBe(false);
});
