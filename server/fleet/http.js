import { ApiError } from '../errors.js';
export async function fleetRequest({
  req,
  res,
  url,
  repo,
  actor,
  body,
  send,
  throttle
}) {
  if (!repo.fleet) throw new ApiError(503, 'Boat registration requires the online database.');
  const base = actor.role === 'admin' ? '/api/admin/fleet' : '/api/owner/boats';
  const path = url.pathname.slice(base.length);
  if (!path && req.method === 'GET') {
    send(200, await repo.fleet.list(actor, Object.fromEntries(url.searchParams)));
    return true;
  }
  if (!path && req.method === 'POST') {
    await throttle(req, 'fleet-create', actor.id);
    send(201, {
      boat: await repo.fleet.create(actor, await body())
    });
    return true;
  }
  const match = path.match(/^\/(BT-[A-F0-9]{16})(?:\/(documents|submit|withdraw|review|owner)(?:\/([a-f0-9-]{36}))?)?$/);
  if (!match) return false;
  const [, id, action, documentId] = match;
  if (req.method === 'GET' && action === 'documents' && documentId) {
    const doc = await repo.fleet.download(id, documentId, actor);
    res.writeHead(200, {
      'Content-Type': doc.mime,
      'Content-Disposition': `attachment; filename="${doc.category}.${doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/png' ? 'png' : 'jpg'}"`,
      'Content-Length': doc.bytes.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'X-Frame-Options': 'DENY'
    });
    res.end(doc.bytes);
    return true;
  }
  if (req.method === 'GET' && !action) {
    send(200, {
      boat: await repo.fleet.detail(id, actor)
    });
    return true;
  }
  if (req.method !== 'POST' || documentId) return false;
  await throttle(req, 'fleet-write', actor.id);
  const input = await body(action === 'documents' ? 8 * 1024 * 1024 : 16384);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Invalid boat request.');
  const method = {
    owner: 'assignOwner',
    documents: 'upload',
    submit: 'submit',
    withdraw: 'withdraw',
    review: 'review'
  }[action] || (!action ? 'update' : null);
  if (!method) return false;
  send(200, {
    boat: await repo.fleet[method](id, actor, input)
  });
  return true;
}
