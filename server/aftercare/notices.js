import { digest } from '../errors.js';
import { translate } from '../../src/i18n/catalog.js';
import { money } from '../../src/domain/booking.js';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[char]);
export async function enqueueNotice(repo, {
  id,
  notice,
  recipients,
  bookingId,
  boatId
}, session) {
  for (const target of recipients) {
    const jobId = id + ':' + target.audience,
      fields = {
        kind: 'notice',
        event: notice.event,
        notice,
        audience: target.audience,
        ...(bookingId ? {
          bookingId
        } : {}),
        ...(boatId ? {
          boatId
        } : {}),
        attempts: 0,
        status: 'pending',
        nextAttemptAt: 0,
        leaseUntil: 0,
        createdAt: new Date().toISOString()
      };
    if (target.email || target.audience === 'admin') await repo.c('outbox').updateOne({
      _id: jobId
    }, {
      $setOnInsert: {
        ...fields,
        recipient: target.email || null,
        messageId: `<${digest(jobId)}@nautica.invalid>`
      }
    }, {
      upsert: true,
      session
    });
    if (repo.smsEnabled && (target.phone || target.audience === 'admin' && repo.smsAdminEnabled)) await repo.c('sms_outbox').updateOne({
      _id: jobId
    }, {
      $setOnInsert: {
        ...fields,
        recipient: target.phone || null
      }
    }, {
      upsert: true,
      session
    });
  }
}
export function noticeMessage(notice, config, recipient, messageId) {
  const language = notice.language === 'hi' ? 'hi' : 'en',
    t = value => translate(value, {}, language),
    fields = (notice.fields || []).map(([key, value]) => [t(key), key === 'Document' ? t(value) : String(value)]),
    heading = t(notice.heading),
    body = t(notice.body);
  return {
    from: {
      name: 'Nautica',
      address: config.user
    },
    to: {
      address: recipient
    },
    subject: heading + ' — ' + notice.reference,
    messageId,
    text: [heading, body, ...fields.map(([key, value]) => key + ': ' + value)].join('\n\n'),
    html: `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;font-size:18px"><h1>${escape(heading)}</h1><p>${escape(body)}</p><dl>${fields.map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></body></html>`,
    disableFileAccess: true,
    disableUrlAccess: true
  };
}
export function noticeSms(notice) {
  const t = value => translate(value, {}, notice.language === 'hi' ? 'hi' : 'en');
  return ['Nautica: ' + t(notice.heading), notice.reference, ...(notice.fields || []).filter(([key]) => ['Refund amount', 'Document', 'Expiry date'].includes(key)).map(([key, value]) => t(key) + ': ' + (key === 'Document' ? t(value) : value))].join('\n');
}
export async function bookingNotice(repo, record, event, heading, session) {
  return enqueueNotice(repo, {
    id: `notice:${record.id}:${event}`,
    bookingId: record.id,
    notice: {
      event,
      heading,
      body: 'Check My account for the latest booking and refund status. A cancelled ticket cannot be used for boarding.',
      reference: record.id,
      language: record.language,
      fields: [['Booking reference', record.id], ['Vessel', record.boat.name], ['Booking status', translate(record.status, {}, record.language || 'en')], ...(record.refund ? [['Refund amount', money(record.refund.amount, 'INR')]] : [])]
    },
    recipients: [{
      audience: 'customer',
      email: record.customer.email,
      phone: record.customer.phone
    }, {
      audience: 'admin'
    }]
  }, session);
}
