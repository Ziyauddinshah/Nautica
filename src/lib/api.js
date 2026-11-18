export class ApiError extends Error { constructor(message,status,data={}){super(message);this.status=status;this.data=data;} }
export async function request(path, { method='GET', body, signal } = {}) {
  let response;
  try { response=await fetch(path,{method,credentials:'same-origin',signal:signal||AbortSignal.timeout(15000),headers:body?{'Content-Type':'application/json','X-Nautica-Request':'1'}:{},body:body?JSON.stringify(body):undefined}); }
  catch(error){if(error.name==='AbortError')throw error;throw new ApiError('The booking server is unavailable. Please try again when connected.',0);}
  let data;try{data=await response.json();}catch{throw new ApiError('The booking server returned an invalid response. Make sure the backend is running.',response.status);}
  if(!response.ok)throw new ApiError(data.error||'Request failed.',response.status,data);
  return data;
}
export const getAvailability=(trip,signal)=>request('/api/availability?'+new URLSearchParams({boatId:trip.boatId,date:trip.date,slot:trip.slot}),{signal});
export const bookSeats=async body=>(await request('/api/bookings',{method:'POST',body})).booking;
