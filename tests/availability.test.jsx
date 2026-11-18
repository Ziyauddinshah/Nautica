import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('booked seats are visibly disabled and auto-selection skips them',async()=>{
 vi.mocked(fetch).mockImplementation(async()=>json({bookedSeats:['01','04']}));
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Choose seats on Ganges Dawn'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Choose seats for me'}).disabled).toBe(false));
 expect(screen.getByRole('button',{name:/Seat 01,.*booked/}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Choose seats for me'}));
 expect(screen.getByRole('button',{name:/Seat 02,/}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('button',{name:/Seat 03,/}).getAttribute('aria-pressed')).toBe('true');
});
test('server availability failure blocks selection and checkout instead of assuming seats are free',async()=>{
 vi.mocked(fetch).mockImplementation(async()=>json({error:'The server is offline.'},503));
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Choose seats on Ganges Dawn'}));
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Choose seats for me'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:/Proceed to payment/}));expect(screen.getByRole('alert').textContent).toMatch(/availability is not verified/);expect(screen.queryByLabelText('Lead guest name')).toBeNull();
});
test('a booking conflict returns to the map, refreshes booked seats and never confirms payment',async()=>{
 let conflicted=false;
 vi.mocked(fetch).mockImplementation(async(path,options={})=>{
  if(options.method==='POST'){conflicted=true;return json({error:'Some seats were just booked. Choose different seats.',bookedSeats:['01','02']},409);}
  return json({bookedSeats:conflicted?['01','02']:[]});
 });
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Choose seats on Ganges Dawn'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Choose seats for me'}).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Choose seats for me'}));fireEvent.click(screen.getByRole('button',{name:/Proceed to payment/}));
 for(const [label,value] of [['Lead guest name','Guest'],['Email address','guest@example.com'],['Phone number','+919876543210'],['UPI ID','guest@okaxis']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:/Verify & pay/}));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,2050));});
 expect(screen.queryByRole('heading',{name:'Booking confirmed.'})).toBeNull();
 expect(screen.getByRole('button',{name:/Seat 01,.*booked/}).disabled).toBe(true);
 expect(screen.getByRole('alert').textContent).toMatch(/just booked/);
});
