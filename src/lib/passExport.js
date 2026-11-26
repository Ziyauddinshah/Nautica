/** @file Browser helper for pass export; keep private server settings out of this module. */
import { translate } from '../i18n/catalog.js';
import * as N from '../domain/booking.js';
import { boardingQrPayload } from '../domain/boardingPass.js';
import { qrSvg } from './qr.js';
const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function passFile(p, currency, locale = 'en') {
  if (p.cancellationPending)
    throw new Error('Boarding is paused while cancellation is under review.');
  if (p.bookingStatus === 'cancelled') throw new Error('This ticket cannot be used for boarding.');
  const t = (value) => translate(value, {}, locale);
  const b = p.boat || N.boats.find((b) => b.id === p.boatId),
    qr = qrSvg(boardingQrPayload(p)),
    svgBytes = new TextEncoder().encode(qr),
    qrData =
      'data:image/svg+xml;base64,' +
      btoa(Array.from(svgBytes, (c) => String.fromCharCode(c)).join(''));
  const seatIds = N.seatText(b, p.seats).split(', '),
    seatLines = [];
  for (let i = 0; i < seatIds.length; i += 12)
    seatLines.push(
      (i ? t('Seats (cont.): ') : t('Seats:') + ' ') + seatIds.slice(i, i + 12).join(', '),
    );
  const text = [
    p.id,
    p.name,
    t(b.name),
    t(b.pier),
    p.date,
    t(p.slot),
    `${p.guests} ${t('guests')} · ${N.money(p.total, currency, locale)}`,
    p.method,
    ...seatLines,
    ...N.extras.filter((e) => p.extras.includes(e.id)).map((e) => t(e.name)),
  ];
  // Estimate glyph width so larger text and long names stay within the printable ticket.
  function wrap(value, size) {
    const lines = [];
    let line = '',
      width = 0;
    for (const char of String(value)) {
      const unit = /\p{Mark}/u.test(char)
        ? 0
        : /[MW@#%&]/.test(char)
          ? 0.95
          : /[\x00-\xff]/.test(char)
            ? 0.65
            : 1.1;
      if (width + unit > 520 / size && line) {
        lines.push(line);
        line = '';
        width = 0;
      }
      line += char;
      width += unit;
    }
    if (line) lines.push(line);
    return lines;
  }
  let y = 130;
  const rows = text
    .flatMap((value, index) =>
      wrap(value, index === 1 ? 26 : 18).map((line) => {
        const row = `<text x="45" y="${y}" font-size="${index === 1 ? 26 : 18}" fill="#0a192f">${escapeHtml(line)}</text>`;
        y += 34;
        return row;
      }),
    )
    .join('');
  const divider = Math.max(485, y + 10),
    qrY = divider + 25,
    footerY = qrY + 280,
    height = footerY + 55;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="${height}" viewBox="0 0 620 ${height}"><rect width="620" height="${height}" fill="#f4f7f9"/><rect x="20" y="20" width="580" height="${height - 40}" rx="20" fill="white"/><path d="M40 20h540q20 0 20 20v45H20V40q0-20 20-20" fill="#0a192f"/><text x="45" y="61" font-family="sans-serif" font-size="26" fill="white">${escapeHtml(t('NAUTICA · BOARDING PASS'))}</text><g font-family="sans-serif">${rows}<path d="M40 ${divider}H580" stroke="#bdcdce" stroke-dasharray="8 6"/><image x="190" y="${qrY}" width="240" height="240" href="${qrData}"/><text x="45" y="${footerY}" font-size="14" fill="#65737e">${escapeHtml(t('Arrive 15 minutes early'))}${p.paymentStatus === 'paid' ? '' : ' · ' + escapeHtml(t('Demo pass · Not valid for real travel'))}</text></g></svg>`;
  return new File([svg], p.id + '.svg', { type: 'image/svg+xml' });
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Nautica boarding pass', files: [file] });
    return true;
  }
  downloadFile(file);
  return false;
}
