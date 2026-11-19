import React from 'react';
import {test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {AuthForm} from '../src/components/AuthForm.jsx';
import ResetPassword from '../src/components/ResetPassword.jsx';
import {consumeResetToken} from '../src/lib/resetLink.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('forgot-password form requests an email link without asking for the current password',async()=>{
 vi.mocked(fetch).mockResolvedValue(json({message:'If an account exists, a reset link will arrive.'}));render(<AuthForm onSuccess={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Forgot password?'}));expect(screen.queryByLabelText('Password',{exact:true})).toBeNull();
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'user@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Send reset link'}));await screen.findByText('If an account exists, a reset link will arrive.');
 const [path,options]=fetch.mock.calls[0];expect(path).toBe('/api/user/forgot-password');expect(JSON.parse(options.body)).toEqual({email:'user@example.test'});expect(localStorage.length).toBe(0);
});
test('reset form enforces matching new passwords and returns to login after success',async()=>{
 const onUser=vi.fn();vi.mocked(fetch).mockResolvedValue(json({ok:true}));render(<ResetPassword token={'a'.repeat(64)} onUser={onUser}/>);
 fireEvent.change(screen.getByLabelText('New password'),{target:{value:'new-unique-passphrase'}});fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'wrong-new-passphrase'}});fireEvent.click(screen.getByRole('button',{name:'Reset password'}));expect(screen.getByRole('alert').textContent).toMatch(/do not match/);expect(fetch).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'new-unique-passphrase'}});fireEvent.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByText(/All devices have been signed out/);expect(onUser).toHaveBeenCalledWith(null);expect(screen.getByRole('button',{name:'Sign in',exact:true})).toBeTruthy();expect(localStorage.length).toBe(0);
});
test('expired reset link displays a fresh request form',async()=>{
 vi.mocked(fetch).mockResolvedValue(json({error:'This reset link is invalid or expired. Request a new one.'},400));render(<ResetPassword token={'b'.repeat(64)} onUser={()=>{}}/>);
 for(const label of ['New password','Confirm new password'])fireEvent.change(screen.getByLabelText(label),{target:{value:'new-unique-passphrase'}});fireEvent.click(screen.getByRole('button',{name:'Reset password'}));await screen.findByRole('button',{name:'Send reset link'});expect(screen.getByRole('alert').textContent).toMatch(/invalid or expired/);
});
test('fragment token is consumed before React mounts and removed from the address bar',()=>{
 const history={replaceState:vi.fn()},token='c'.repeat(64);
 expect(consumeResetToken({pathname:'/reset-password',hash:'#token='+token},history)).toBe(token);expect(history.replaceState).toHaveBeenCalledWith(null,'','/reset-password');
 expect(consumeResetToken({pathname:'/reset-password',hash:'#token=invalid'},history)).toBeNull();expect(consumeResetToken({pathname:'/',hash:'#token='+token},history)).toBeNull();
});
