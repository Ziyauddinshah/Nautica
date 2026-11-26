/** @file Serves a built development app on a trusted LAN; not a production HTTPS deployment. */
import { networkInterfaces } from 'node:os';
if (process.env.NODE_ENV === 'production')
  throw new Error(
    'Use the HTTPS production deployment for internet access. npm run share is for a trusted local network.',
  );
process.env.HOST = '0.0.0.0';
console.log(
  'Shared local-network server: keep this ONE computer running. Sign in to the same account on each device.',
);
for (const interfaces of Object.values(networkInterfaces()))
  for (const address of interfaces || []) {
    if (address.family === 'IPv4' && !address.internal)
      console.log(
        `Open http://${address.address}:${process.env.PORT || 3001} on your other devices.`,
      );
  }
console.log(
  'Trusted LAN testing only: this mode does not provide HTTPS. Do not expose it to the internet.',
);
await import('../server/index.js');
