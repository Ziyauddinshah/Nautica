import React from 'react';
import { test,expect,vi } from 'vitest';
import { render,screen,fireEvent,waitFor,act } from '@testing-library/react';
import App from '../src/App.jsx';
import CustomerAccount from '../src/components/CustomerAccount.jsx';
import { AuthForm } from '../src/components/AuthForm.jsx';
import * as N from '../src/domain/booking.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const user={id:'account-one',name:'Own Customer',email:'own@example.test',phone:'+919876543210',createdAt:'2026-11-19T00:00:00Z'};
const record={id:'NTC-ABCDEF123456',status:'confirmed',createdAt:'2026-11-19T01:00:00Z',boat:N.boats[0],trip:{date:'2027-01-15',slot:N.slots[0],guests:1,seats:['01']},payment:{amount:126000,method:'VISA · 4242',status:'demo_paid',reference:'DEMO-OWN',paidAt:'2026-11-19T01:00:00Z'},notifications:[{audience:'customer',status:'sent'}],pass:{id:'NTC-ABCDEF123456',boatId:'b1',name:'Own Customer',date:'2027-01-15',slot:N.slots[0],guests:1,seats:['01'],extras:['safety'],total:126000,method:'VISA · 4242',serverConfirmed:true}};
test('registration sends account fields, checks password confirmation, and does not store credentials in browser storage',async()=>{
 const success=vi.fn();vi.mocked(fetch).mockResolvedValue(json({user},201));render(<AuthForm onSuccess={success}/>);
 fireEvent.click(screen.getByRole('button',{name:'New here? Create an account'}));
 for(const [label,value]of [['Full name','Own Customer'],['Phone number','+919876543210'],['Email address','own@example.test'],['Password','a-unique-passphrase'],['Confirm password','different-value']])fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Create account'}));expect(screen.getByRole('alert').textContent).toMatch(/do not match/);expect(fetch).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Confirm password'),{target:{value:'a-unique-passphrase'}});fireEvent.click(screen.getByRole('button',{name:'Create account'}));await waitFor(()=>expect(success).toHaveBeenCalledWith(user));expect(localStorage.length).toBe(0);
});
test('guests must sign in before booking and the intended trip resumes after login',async()=>{
 let signed=false;vi.mocked(fetch).mockImplementation(async(path)=>{
  if(path==='/api/payments/config')return json({mode:'demo',enabled:true});
  if(path==='/api/user/session')return signed?json({user}):json({error:'Sign in'},401);
  if(path==='/api/user/login'){signed=true;return json({user});}
  if(path==='/api/user/bookings')return json({bookings:[],total:0});
  return json({bookedSeats:[]});
 });
 render(<App/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Sign in / Register'}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Choose seats on Ganges Dawn'}));expect(screen.queryByText('Choose your spot on board.')).toBeNull();
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'own@example.test'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'a-unique-passphrase'}});fireEvent.click(screen.getByRole('button',{name:'Sign in',exact:true}));
 await screen.findByText('Choose your spot on board.');await waitFor(()=>expect(screen.getByRole('button',{name:'Choose seats for me'}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Choose seats for me'}));fireEvent.click(screen.getByRole('button',{name:/Proceed to payment/}));expect(screen.getByLabelText('Email address').readOnly).toBe(true);expect(screen.getByLabelText('Email address').value).toBe(user.email);
});
test('account shows server booking/payment details and logout removes the private view',async()=>{
 vi.mocked(fetch).mockImplementation(async path=>path==='/api/user/logout'?json({ok:true}):json({bookings:[record],total:1}));
 const changed=vi.fn();const view=render(<CustomerAccount user={user} onUser={changed} currency="INR" onCurrency={()=>{}}/>);
 await screen.findByText('Ganges Dawn');expect(screen.getByText(/Seats 01/)).toBeTruthy();fireEvent.click(screen.getByRole('tab',{name:'Payment history'}));expect(screen.getByText('DEMO-OWN')).toBeTruthy();expect(screen.getByText('Demo payment recorded')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Sign out'}));await waitFor(()=>expect(changed).toHaveBeenCalledWith(null));view.rerender(<CustomerAccount user={null} onUser={changed} currency="INR" onCurrency={()=>{}}/>);expect(screen.queryByText('DEMO-OWN')).toBeNull();expect(screen.getByRole('button',{name:'Sign in',exact:true})).toBeTruthy();
});
test('password change requests reauthentication and clears history on success',async()=>{
 vi.mocked(fetch).mockImplementation(async path=>path==='/api/user/password'?json({ok:true}):json({bookings:[record],total:1}));const changed=vi.fn();render(<CustomerAccount user={user} onUser={changed} currency="INR" onCurrency={()=>{}}/>);await screen.findByText('Ganges Dawn');fireEvent.click(screen.getByRole('tab',{name:'Account security'}));
 for(const [label,value]of [['Current password','original-passphrase'],['New password','changed-passphrase'],['Confirm new password','changed-passphrase']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Change password and sign out'}));await waitFor(()=>expect(changed).toHaveBeenCalledWith(null));expect(fetch.mock.calls.some(([path])=>path==='/api/user/password')).toBe(true);
});
test('legacy local pass caches are never used as account ownership or exposed to another account',async()=>{
 localStorage.setItem('nautica.web.passes',JSON.stringify([{name:'Someone Else',id:'OLD'}]));render(<App/>);await screen.findByRole('link',{name:'My account'});expect(localStorage.getItem('nautica.web.passes')).toContain('Someone Else');expect(screen.queryByText('Someone Else')).toBeNull();
});
