import { randomUUID } from 'node:crypto';
import { ApiError, digest } from '../errors.js';
import { boatDocumentTypes } from '../../src/domain/fleet.js';
import { enqueueNotice } from './notices.js';
export const reminderDate = (now = new Date()) => new Date(+now + 19800000).toISOString().slice(0, 10);
export function documentStage(expiresOn, today = reminderDate()) {
  if (typeof expiresOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(Date.parse(expiresOn)) || new Date(expiresOn).toISOString().slice(0, 10) !== expiresOn) return null;
  const days = Math.round((Date.parse(expiresOn) - Date.parse(today)) / 86400000);
  if (days > 30) return null;
  return {
    days,
    stage: days < 0 ? 'expired' : days === 0 ? 'today' : days <= 1 ? '1' : days <= 7 ? '7' : days <= 14 ? '14' : '30'
  };
}
export class DocumentReminders {
  constructor(repo) {
    this.repo = repo;
  }
  c(name) {
    return this.repo.c(name);
  }
  async current(notice, now = new Date()) {
    if (!notice.document) return true;
    const d = notice.document,
      boat = await this.c('boats').findOne({
        _id: d.boatId
      }),
      doc = boat?.documents?.[d.category];
    return Boolean(doc && doc.id === d.id && doc.expiresOn === d.expiresOn && documentStage(doc.expiresOn, reminderDate(now))?.stage === d.stage);
  }
  async message(job, channel) {
    if (!(await this.current(job.notice))) return {
      notice: job.notice,
      suppress: true
    };
    if (job.notice.document && job.audience === 'owner') {
      const boat = await this.c('boats').findOne({
          _id: job.notice.document.boatId
        }),
        owner = boat?.ownerId ? await this.c('users').findOne({
          _id: boat.ownerId
        }) : null;
      const recipient = channel === 'email' ? owner?.email : owner?.phone;
      return {
        notice: job.notice,
        recipientOverride: recipient,
        suppress: !recipient
      };
    }
    return {
      notice: job.notice
    };
  }
  async queue(boatId, category, now = new Date()) {
    return this.repo.transaction(async session => {
      const boat = await this.c('boats').findOne({
          _id: boatId
        }, {
          session
        }),
        doc = boat?.documents?.[category],
        state = doc && documentStage(doc.expiresOn, reminderDate(now)),
        type = boatDocumentTypes.find(item => item.id === category);
      if (!boat || !doc?.id || !state || !type) return;
      const owner = boat.ownerId ? await this.c('users').findOne({
        _id: boat.ownerId
      }, {
        session
      }) : null;
      const recipients = [...(owner ? [{
        audience: 'owner',
        email: owner.email,
        phone: owner.phone
      }] : []), {
        audience: 'admin'
      }];
      const id = 'expiry:' + digest([boatId, category, doc.id, doc.expiresOn, state.stage].join('|'));
      await enqueueNotice(this.repo, {
        id,
        boatId,
        notice: {
          event: 'document_expiry',
          heading: state.stage === 'expired' ? 'Boat document expired' : 'Boat document validity reminder',
          body: 'Review and renew this boat document. Expired documents block new bookings. Uploading a replacement requires admin review.',
          reference: boatId,
          language: boat.language || 'en',
          document: {
            boatId,
            category,
            id: doc.id,
            expiresOn: doc.expiresOn,
            stage: state.stage
          },
          fields: [['Vessel', boat.details.name], ['Document', type.label], ['Expiry date', doc.expiresOn]]
        },
        recipients
      }, session);
    });
  }
  async run(now = new Date(), shouldStop = () => false) {
    try {
      await this.c('maintenance').updateOne({
        _id: 'document-expiry'
      }, {
        $setOnInsert: {
          leaseUntil: 0,
          nextRunAt: 0
        }
      }, {
        upsert: true
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const token = randomUUID();
    const claimed = await this.c('maintenance').findOneAndUpdate({
      _id: 'document-expiry',
      $expr: {
        $and: [{
          $lte: ['$leaseUntil', {
            $toLong: '$$NOW'
          }]
        }, {
          $lte: ['$nextRunAt', {
            $toLong: '$$NOW'
          }]
        }]
      }
    }, [{
      $set: {
        leaseToken: token,
        leaseUntil: {
          $add: [{
            $toLong: '$$NOW'
          }, 120000]
        }
      }
    }], {
      returnDocument: 'after'
    });
    if (!claimed) return {
      claimed: false
    };
    let count = 0,
      success = false;
    try {
      for await (const boat of this.c('boats').find({}, {
        projection: {
          _id: 1,
          documents: 1
        }
      })) {
        if (shouldStop()) return {
          claimed: true,
          stopped: true
        };
        if (count % 25 === 0) {
          const extended = await this.c('maintenance').updateOne({
            _id: 'document-expiry',
            leaseToken: token
          }, [{
            $set: {
              leaseUntil: {
                $add: [{
                  $toLong: '$$NOW'
                }, 120000]
              }
            }
          }]);
          if (!extended.matchedCount) return {
            claimed: false
          };
        }
        for (const category of Object.keys(boat.documents || {})) if (documentStage(boat.documents[category]?.expiresOn, reminderDate(now))) await this.queue(boat._id, category, now);
        count++;
      }
      success = true;
      return {
        claimed: true,
        boats: count
      };
    } finally {
      await this.c('maintenance').updateOne({
        _id: 'document-expiry',
        leaseToken: token
      }, [{
        $set: {
          leaseUntil: 0,
          lastRunAt: '$$NOW',
          nextRunAt: {
            $add: [{
              $toLong: '$$NOW'
            }, success ? 3600000 : 60000]
          }
        }
      }, {
        $unset: 'leaseToken'
      }]);
    }
  }
  async status(id, actor) {
    const boat = await this.repo.fleet.load(id, actor);
    const today = reminderDate(),
      documents = boatDocumentTypes.filter(type => boat.documents?.[type.id]?.expiresOn).map(type => {
        const doc = boat.documents[type.id];
        return {
          category: type.id,
          label: type.label,
          id: doc.id,
          expiresOn: doc.expiresOn,
          pendingRenewal: Boolean(boat.pendingDocuments?.[type.id]),
          daysRemaining: Math.round((Date.parse(doc.expiresOn) - Date.parse(today)) / 86400000)
        };
      });
    const filter = {
      boatId: id,
      event: 'document_expiry',
      ...(actor.role === 'admin' ? {} : {
        audience: 'owner'
      })
    };
    const projection = {
      _id: 0,
      audience: 1,
      status: 1,
      attempts: 1,
      sentAt: 1,
      deliveredAt: 1,
      event: 1,
      'notice.document': 1
    };
    const email = await this.c('outbox').find(filter, {
        projection
      }).sort({
        createdAt: -1
      }).limit(100).toArray(),
      sms = await this.c('sms_outbox').find(filter, {
        projection
      }).sort({
        createdAt: -1
      }).limit(100).toArray();
    return {
      documents,
      notifications: [...email.map(row => ({
        ...row,
        channel: 'email'
      })), ...sms.map(row => ({
        ...row,
        channel: 'sms'
      }))]
    };
  }
  async retry(id, actor) {
    if (actor.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    await this.repo.fleet.load(id, actor);
    await this.c('outbox').updateMany({
      boatId: id,
      event: 'document_expiry',
      status: 'failed'
    }, {
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0
      }
    });
    await this.c('sms_outbox').updateMany({
      boatId: id,
      event: 'document_expiry',
      status: 'failed',
      batchId: {
        $exists: false
      }
    }, {
      $set: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0
      }
    });
    return {
      ok: true
    };
  }
}
