export class ApiError extends Error { constructor(message,status,data={}){super(message);this.status=status;this.data=data;} }
export async function request(path, { method='GET', body, signal } = {}) {
  let response;
  try { response=await fetch(path,{method,credentials:'same-origin',signal:signal||AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json','X-Nautica-Request':'1'}:{},body:body?JSON.stringify(body):undefined}); }
  catch(error){if(error.name==='AbortError')throw error;throw new ApiError('Unable to connect. Check your connection and try again.',0);}
  let data;try{data=await response.json();}catch{throw new ApiError('Something went wrong. Please try again later.',response.status);}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new ApiError('Something went wrong. Please try again later.',response.status);
  if(!response.ok)throw new ApiError(response.status>=500?'Something went wrong. Please try again later.':(typeof data.error==='string'?data.error:'This request could not be completed. Please try again.'),response.status,{...(Array.isArray(data.bookedSeats)?{bookedSeats:data.bookedSeats.filter(seat=>typeof seat==='string'&&/^\d{2}$/.test(seat))}:{})});
  return data;
}
export const getAvailability=(trip,signal)=>request('/api/availability?'+new URLSearchParams({boatId:trip.boatId,date:trip.date,slot:trip.slot}),{signal});
export const bookSeats=async body=>(await request('/api/bookings',{method:'POST',body})).booking;
