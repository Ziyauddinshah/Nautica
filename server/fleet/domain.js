import { ApiError } from '../errors.js';
import { types, seatLayout } from '../../src/domain/booking.js';
import { boatDocumentTypes, fleetChecks } from '../../src/domain/fleet.js';
export const indiaDate = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
export function boatDetails(input) {
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Enter complete boat details.');
  for (const [key, min, max] of [['name', 2, 80], ['operatorName', 2, 120], ['registrationNumber', 3, 60], ['registrationAuthority', 3, 160], ['boardingInstructions', 10, 600], ['description', 20, 1500]]) if (!text(input[key], min, max)) throw new ApiError(400, 'Enter valid boat, operator and registration details.');
  if (!/^[A-Z0-9 /.-]+$/i.test(input.registrationNumber) || !types.slice(1).includes(input.type) || !['manual', 'motor', 'electric'].includes(input.propulsion) || !['Assi Ghat', 'Dashashwamedh Ghat'].includes(input.pier) || !Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 60 || !Number.isSafeInteger(input.fare) || input.fare < 100 || input.fare > 100000000 || !Number.isInteger(input.lifeJackets) || input.lifeJackets < input.capacity + 1 || input.lifeJackets > 200 || input.captainIncluded !== true) throw new ApiError(400, 'Check capacity, fare, life jackets, captain and operating location.');
  if (!Array.isArray(input.amenities) || input.amenities.length > 12 || input.amenities.some(item => !text(item, 2, 60))) throw new ApiError(400, 'Enter valid amenities.');
  // Seat labels are generated from the declared capacity; approval requires the actual layout proof.
  const result = {};
  for (const key of ['name', 'operatorName', 'registrationNumber', 'registrationAuthority', 'boardingInstructions', 'description', 'type', 'propulsion', 'pier', 'capacity', 'fare', 'lifeJackets', 'captainIncluded']) result[key] = typeof input[key] === 'string' ? input[key].trim() : input[key];
  result.amenities = [...new Set(input.amenities.map(value => value.trim()))];
  result.timeZone = 'Asia/Kolkata';
  result.jurisdiction = 'IN-UP-Varanasi';
  result.tone = '#366b72';
  return result;
}
export const registrationKey = details => details.jurisdiction + ':' + details.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function documentMetadata(input) {
  const category = boatDocumentTypes.find(item => item.id === input?.category);
  if (!category || !text(input.number, 2, 100) || !text(input.issuer, 2, 160)) throw new ApiError(400, 'Choose a document category and enter its number and issuer.');
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!validDate(input.issuedOn) || input.issuedOn > indiaDate() || category.expiring && !validDate(input.expiresOn) || input.expiresOn && (!validDate(input.expiresOn) || input.expiresOn < input.issuedOn)) throw new ApiError(400, 'Enter valid document issue and expiry dates.');
  return {
    category: category.id,
    number: input.number.trim(),
    issuer: input.issuer.trim(),
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn || null
  };
}
export function documentBytes(input) {
  if (typeof input?.data !== 'string' || input.data.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new ApiError(400, 'Upload a PDF, PNG or JPEG up to 5 MB.');
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== input.data) throw new ApiError(400, 'Invalid document file.');
  let mime;
  if (bytes.subarray(0, 5).toString() === '%PDF-') mime = 'application/pdf';else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) mime = 'image/jpeg';
  if (!mime || mime !== input.mime) throw new ApiError(400, 'File contents must match a supported PDF, PNG or JPEG type.');
  return {
    bytes,
    mime
  };
}
export function completeDocuments(boat, travelDate = indiaDate(), requireScan = false) {
  return boatDocumentTypes.every(type => {
    const doc = boat.documents?.[type.id];
    return doc && (!requireScan || doc.scanStatus === 'clean') && (!type.expiring || Boolean(doc.expiresOn)) && (!doc.expiresOn || doc.expiresOn >= travelDate);
  });
}
export function publicBoat(boat) {
  const d = boat.details;
  return {
    id: boat._id,
    name: d.name,
    type: d.type,
    pier: d.pier,
    capacity: d.capacity,
    fare: d.fare,
    amenities: d.amenities,
    tone: d.tone,
    timeZone: d.timeZone,
    description: d.description,
    boardingInstructions: d.boardingInstructions,
    captainIncluded: true,
    seatPlan: seatLayout(d),
    revision: boat.revision,
    documentsReviewed: true
  };
}
export function privateBoat(boat, actor) {
  const review = boat.review ? {
    at: boat.review.at,
    notes: boat.review.notes,
    checks: boat.review.checks,
    suspensionReason: boat.review.suspensionReason,
    ...(actor?.role === 'admin' ? {
      by: boat.review.by
    } : {})
  } : null;
  return {
    id: boat._id,
    ownerId: boat.ownerId,
    ...(actor?.role === 'admin' ? {
      createdBy: boat.createdBy
    } : {}),
    status: boat.status,
    revision: boat.revision,
    details: boat.details,
    documents: boat.documents || {},
    pendingDocuments: Object.fromEntries(Object.entries(boat.pendingDocuments || {}).map(([key, value]) => {
      const doc = {
        ...value
      };
      if (actor?.role !== 'admin') delete doc.uploadedBy;
      return [key, doc];
    })),
    renewalReview: boat.renewalReview ? {
      status: boat.renewalReview.status,
      notes: boat.renewalReview.notes,
      at: boat.renewalReview.at
    } : null,
    createdAt: boat.createdAt,
    submittedAt: boat.submittedAt,
    review
  };
}
export function approvalChecks(input) {
  if (!input?.checks || !fleetChecks.every(([key]) => input.checks[key] === true) || !text(input.notes, 10, 2000)) throw new ApiError(400, 'Complete every review check and add a review note.');
  return Object.fromEntries(fleetChecks.map(([key]) => [key, true]));
}
