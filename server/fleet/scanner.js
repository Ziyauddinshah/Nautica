/** @file Private malware scanner integration for uploaded boat documents. */
import net from 'node:net';
import { ApiError } from '../errors.js';
export function documentScanner(env = process.env) {
  const required = env.NODE_ENV === 'production',
    host = env.CLAMAV_HOST?.trim(),
    port = Number(env.CLAMAV_PORT || 3310);
  return async (bytes) => {
    if (!host) {
      if (required) throw new ApiError(503, 'Document scanning is unavailable. Try again later.');
      return 'not_scanned';
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new ApiError(503, 'Document scanning is unavailable.');
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host,
        port,
      });
      let response = '',
        done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        socket.destroy();
        error ? reject(error) : resolve(value);
      };
      socket.setTimeout(15000, () => finish(new ApiError(503, 'Document scanning timed out.')));
      socket.on('error', () => finish(new ApiError(503, 'Document scanning is unavailable.')));
      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0'));
        for (let index = 0; index < bytes.length; index += 65536) {
          const chunk = bytes.subarray(index, index + 65536),
            length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
        if (response.length > 4096) return finish(new ApiError(503, 'Document scan failed.'));
        if (response.includes('\0') || response.includes('\n')) {
          if (/: OK\s*\0?$/.test(response)) finish(null, 'clean');
          else if (/ FOUND/.test(response))
            finish(new ApiError(400, 'Document rejected by security scanning.'));
          else finish(new ApiError(503, 'Document scan failed.'));
        }
      });
      socket.on('end', () => {
        if (!done) finish(new ApiError(503, 'Document scan failed.'));
      });
    });
  };
}
