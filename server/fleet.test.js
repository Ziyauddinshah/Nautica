import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boatDetails, documentBytes, documentMetadata, completeDocuments } from './fleet/domain.js';
import { documentScanner } from './fleet/scanner.js';
import { boatDocumentTypes } from '../src/domain/fleet.js';
test('fleet validation rejects unsafe files, unrealistic safety capacity and invalid document dates', () => {
  assert.throws(() => boatDetails({
    capacity: 60,
    lifeJackets: 0
  }), {
    status: 400
  });
  for (const input of [{
    data: Buffer.from('<svg onload="alert(1)">').toString('base64'),
    mime: 'image/svg+xml'
  }, {
    data: Buffer.from('%PDF-1.4').toString('base64'),
    mime: 'image/png'
  }, {
    data: '%%%invalid',
    mime: 'application/pdf'
  }]) assert.throws(() => documentBytes(input), {
    status: 400
  });
  assert.throws(() => documentMetadata({
    category: 'insurance',
    number: '1234',
    issuer: 'Authority',
    issuedOn: '2025-02-30',
    expiresOn: '2027-01-01'
  }), {
    status: 400
  });
  const documents = Object.fromEntries(boatDocumentTypes.map(type => [type.id, {
    expiresOn: '2030-01-01',
    scanStatus: 'not_scanned'
  }]));
  assert.equal(completeDocuments({
    documents
  }, '2029-12-31'), true);
  assert.equal(completeDocuments({
    documents
  }, '2030-01-02'), false);
  assert.equal(completeDocuments({
    documents
  }, '2029-12-31', true), false);
});
test('production document uploads fail closed without a scanner', async () => {
  await assert.rejects(documentScanner({
    NODE_ENV: 'production'
  })(Buffer.from('%PDF-1.4')), {
    status: 503
  });
  assert.equal(await documentScanner({
    NODE_ENV: 'development'
  })(Buffer.from('%PDF-1.4')), 'not_scanned');
});
test('private ClamAV stream results accept clean scans and reject infected content', async () => {
  const {
    createServer
  } = await import('node:net');
  let infected = false,
    received = 0;
  const server = createServer(socket => {
    let data = Buffer.alloc(0);
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length >= 10 + 4 + 9 + 4) {
        received = data.length;
        socket.end(infected ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const scan = documentScanner({
    NODE_ENV: 'production',
    CLAMAV_HOST: '127.0.0.1',
    CLAMAV_PORT: String(server.address().port)
  });
  try {
    assert.equal(await scan(Buffer.from('%PDF-1.4\n')), 'clean');
    assert.equal(received, 27);
    infected = true;
    await assert.rejects(scan(Buffer.from('%PDF-1.4\n')), {
      status: 400
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
