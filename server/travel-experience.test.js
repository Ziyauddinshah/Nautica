/** @file Public listing sanitization and refund estimates preserve private data boundaries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { listingPhoto } from './fleet/photo.js';
import { publicBoat } from './fleet/domain.js';
import { cancellationInfo } from './aftercare/policy.js';
import { boats, slots } from '../src/domain/booking.js';
test('listing photos strip EXIF and reject missing consent, unscanned and corrupt images', async () => {
  const bytes = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#336677' },
  })
    .withExif({ IFD0: { Artist: 'PRIVATE_PHOTO_CANARY' } })
    .png()
    .toBuffer();
  const input = {
    data: bytes.toString('base64'),
    mime: 'image/png',
    alt: 'Real boat viewed from the pier',
    consent: true,
  };
  const photo = await listingPhoto(input, async () => 'clean'),
    output = Buffer.from(photo.data, 'base64'),
    metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
  assert.equal(output.includes(Buffer.from('PRIVATE_PHOTO_CANARY')), false);
  await assert.rejects(
    listingPhoto({ ...input, consent: false }, async () => 'clean'),
    { status: 400 },
  );
  await assert.rejects(
    listingPhoto(input, async () => 'not_scanned'),
    { status: 503 },
  );
  await assert.rejects(
    listingPhoto(
      { ...input, data: Buffer.from('not a photo').toString('base64') },
      async () => 'clean',
    ),
    { status: 400 },
  );
});
test('public boat details omit photo bytes, ownership, registration and document identities', () => {
  const view = publicBoat({
    _id: 'BT-1234567890ABCDEF',
    revision: 2,
    details: {
      ...boats[0],
      registrationNumber: 'PRIVATE_REGISTRATION',
      operatorName: 'PRIVATE_OWNER',
      accessibilityNotes: 'Ask for assisted boarding',
      safetyNotes: 'Wear a life jacket',
    },
    coverPhoto: { data: 'PRIVATE_BYTES', alt: 'Real wooden boat' },
    documents: { registration: { number: 'PRIVATE_DOC' } },
  });
  assert.match(view.photoUrl, /^\/api\/boats\/BT-/);
  assert.equal(view.accessibilityNotes, 'Ask for assisted boarding');
  assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
});
test('refund estimates use stored INR amounts and become zero outside the saved policy window', () => {
  const row = {
    status: 'confirmed',
    boat: boats[0],
    trip: { date: '2050-01-03', slot: slots[0] },
    payment: { status: 'paid', amount: 126000 },
    cancellationPolicy: { cutoffHours: 24, version: 'full-refund-v1' },
  };
  const eligible = cancellationInfo(row, new Date('2050-01-01'));
  assert.equal(eligible.estimatedRefund, 126000);
  assert.equal(eligible.currency, 'INR');
  assert.equal(eligible.estimateOnly, true);
  assert.equal(cancellationInfo(row, new Date('2050-01-04')).estimatedRefund, 0);
  assert.equal(
    cancellationInfo(
      { ...row, payment: { status: 'pending', amount: 126000 } },
      new Date('2050-01-01'),
    ).estimatedRefund,
    0,
  );
});
