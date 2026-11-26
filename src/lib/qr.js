/** @file Browser helper for qr; keep private server settings out of this module. */
import qrcode from 'qrcode-generator';

export function qrSvg(payload) {
  qrcode.stringToBytes = (text) => Array.from(new TextEncoder().encode(text));
  const code = qrcode(0, 'M');
  code.addData(payload);
  code.make();
  return code.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}
