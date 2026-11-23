const BASE='https://api.textbee.dev/api/v1';
export function smsPhone(value,countryCode='91'){
 if(typeof value!=='string'||!/^[+\d ().-]+$/.test(value.trim()))return null;
 let number=value.trim().replace(/[ ().-]/g,'');
 if(countryCode==='91'&&/^\d{10}$/.test(number))number='+91'+number;
 else if(countryCode==='91'&&/^91\d{10}$/.test(number))number='+'+number;
 return /^\+[1-9]\d{7,14}$/.test(number)?number:null;
}
export function textbeeConfig(env=process.env){
 const enabled=env.SMS_ENABLED==='true',apiKey=(env.TEXTBEE_API_KEY||'').trim(),deviceId=(env.TEXTBEE_DEVICE_ID||'').trim().toLowerCase(),countryCode=env.SMS_DEFAULT_COUNTRY_CODE??'91';
 const validKey=apiKey.length>0&&apiKey.length<=512&&!/[\r\n]/.test(apiKey);
 return {enabled,configured:enabled&&validKey&&/^[a-f\d]{24}$/i.test(deviceId),apiKey,deviceId,countryCode,adminTo:smsPhone(env.SMS_ADMIN_TO,countryCode)};
}
export class SmsError extends Error{constructor(code,{retryable=false,unknown=false}={}){super('SMS service request failed.');this.code=code;this.retryable=retryable;this.unknown=unknown;}}
export function createTextbeeGateway({config=textbeeConfig(),transport=fetch}={}){
 async function request(path,body){
  if(!config.configured)throw new SmsError('SMS_NOT_CONFIGURED');
  let response;try{response=await transport(BASE+path,{method:body?'POST':'GET',redirect:'error',headers:{'x-api-key':config.apiKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}catch{throw new SmsError('SMS_REQUEST_UNKNOWN',{unknown:Boolean(body)});}
  if(!response.ok){if(response.status===429)throw new SmsError('SMS_RATE_LIMITED',{retryable:true});if([400,401,403,404].includes(response.status))throw new SmsError('SMS_REQUEST_REJECTED');throw new SmsError('SMS_REQUEST_UNKNOWN',{unknown:Boolean(body)});}
  try{return await response.json();}catch{throw new SmsError('SMS_RESPONSE_UNKNOWN',{unknown:Boolean(body)});}
 }
 return {config,enabled:config.configured,async send(recipient,message){
  if(!smsPhone(recipient,config.countryCode))throw new SmsError('SMS_INVALID_RECIPIENT');
  const result=await request('/gateway/send-sms',{recipients:[recipient],message,deviceId:config.deviceId});
  if(result?.data?.success===false||!(/^[a-f\d]{24}$/i.test(result?.data?.smsBatchId||'')))throw new SmsError('SMS_RESPONSE_UNKNOWN',{unknown:true});
  return {batchId:result.data.smsBatchId};
 },async status(batchId,recipient){
  if(!/^[a-f\d]{24}$/i.test(batchId||''))throw new SmsError('SMS_INVALID_BATCH');
  const result=await request('/gateway/devices/'+config.deviceId+'/sms-batch/'+batchId);
  const data=result?.data;if(data?.batch?._id!==batchId||!Array.isArray(data.messages))throw new SmsError('SMS_STATUS_UNAVAILABLE');
  const message=data.messages.find(row=>smsPhone(row.recipient,config.countryCode)===recipient);
  const status=message?.status;
  return {status:['pending','dispatched','sent','delivered','failed','unknown'].includes(status)?status:'unknown'};
 },async verify(){const result=await request('/gateway/devices/'+config.deviceId);if(result?.data?._id!==config.deviceId||result.data.enabled!==true)throw new SmsError('SMS_DEVICE_UNAVAILABLE');return {enabled:true};}};
}
