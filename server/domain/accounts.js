import {scryptSync,timingSafeEqual} from 'node:crypto';
import {ApiError} from '../errors.js';
export function publicUser(row){return {id:row.id,name:row.name,email:row.email,phone:row.phone,createdAt:row.created_at};}
export function profile(input){
 if(!input||typeof input!=='object')throw new ApiError(400,'Enter valid account details.');
 const name=typeof input.name==='string'?input.name.trim():'';
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 const phone=typeof input.phone==='string'?input.phone.trim():'';
 if(name.length<2||name.length>80||email.length>150||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||!/^\+?[\d ()-]{7,25}$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw new ApiError(400,'Enter a valid name, email and phone number.');
 return {name,email,phone};
}
export function passwordValid(password){return typeof password==='string'&&password.length>=12&&password.length<=256;}
export function passwordMatches(row,password){
 const candidate=scryptSync(password,row?.salt||'nautica-user-dummy-salt',64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return !!row&&timingSafeEqual(candidate,Buffer.from(row.hash,'hex'));
}
