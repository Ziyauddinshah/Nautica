import React from 'react';
import {test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import App from '../src/App.jsx';
import {I18nProvider} from '../src/i18n/I18nProvider.jsx';
import {hi,uiKeys,translate} from '../src/i18n/catalog.js';
test('every initial UI phrase has a Hindi translation and interpolation preserves seat IDs',()=>{
 for(const key of uiKeys)expect(Object.hasOwn(hi,key),key).toBe(true);
 expect(translate('Seat {{v0}}, {{v1}}',{v0:'01',v1:'booked'},'hi')).toContain('01');
});
test('language switch persists Hindi and translated filters keep stable English values',async()=>{
 render(<I18nProvider><App/></I18nProvider>);await screen.findAllByRole('article');
 fireEvent.change(screen.getByRole('combobox',{name:'Language'}),{target:{value:'hi'}});
 await waitFor(()=>expect(document.documentElement.lang).toBe('hi'));
 expect(localStorage.getItem('nautica.language')).toBe('hi');
 const select=screen.getAllByRole('combobox').find(el=>Array.from(el.options).some(option=>option.value==='Assi Ghat'));
 expect(select).toBeTruthy();fireEvent.change(select,{target:{value:'Assi Ghat'}});expect(screen.getAllByRole('article')).toHaveLength(2);
 fireEvent.change(screen.getByRole('combobox',{name:hi.Language}),{target:{value:'en'}});expect(screen.getByRole('button',{name:'Find my escape'})).toBeTruthy();
});
test('hosted payment form collects contact details without card or UPI credentials',async()=>{
 const {default:PaymentForm,emptyDraft}=await import('../src/components/PaymentForm.jsx');
 const {boats,slots}=await import('../src/domain/booking.js');const onPay=vi.fn();
 render(<PaymentForm paymentMode="razorpay" boat={boats[0]} trip={{date:'2027-01-01',slot:slots[0],guests:1,seats:['01'],extras:['safety']}} currency="INR" draft={{...emptyDraft(),name:'Admin',email:'one@example.test',phone:'+919876543210'}} onDraft={()=>{}} onPay={onPay} onBack={()=>{}}/>);
 expect(screen.queryByLabelText('Card number')).toBeNull();expect(screen.queryByLabelText('CVV')).toBeNull();expect(screen.queryByLabelText('UPI ID')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Pay with Razorpay/}));expect(onPay).toHaveBeenCalledOnce();expect(onPay.mock.calls[0][0].name).toBe('Admin');
});
