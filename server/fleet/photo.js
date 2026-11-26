/** @file Validates public listing photos and removes metadata by decoding and re-encoding JPEG. */
import sharp from 'sharp';
import { ApiError } from '../errors.js';
import { documentBytes } from './domain.js';
export async function listingPhoto(input, scan) {
  if (
    input?.consent !== true ||
    typeof input.alt !== 'string' ||
    input.alt.trim().length < 5 ||
    input.alt.length > 160
  )
    throw new ApiError(
      400,
      'Confirm photo publishing rights and enter a useful photo description.',
    );
  const file = documentBytes(input);
  if (!['image/jpeg', 'image/png'].includes(file.mime))
    throw new ApiError(400, 'Use a JPEG or PNG boat photo.');
  const result = await scan(file.bytes);
  if (result !== 'clean')
    throw new ApiError(503, 'Photo scanning must be available before publishing.');
  try {
    const data = await sharp(file.bytes, { limitInputPixels: 20000000, animated: false })
      .rotate()
      .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (data.length > 500000) throw new Error();
    return { data: data.toString('base64'), alt: input.alt.trim(), mime: 'image/jpeg' };
  } catch {
    throw new ApiError(400, 'The photo could not be processed. Use a smaller JPEG or PNG.');
  }
}
