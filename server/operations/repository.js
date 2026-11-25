import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { ApiError, digest } from '../errors.js';
import { enqueueNotice } from '../aftercare/notices.js';
import { conditions, incidentNotice, alertView } from './catalog.js';
export const instanceId = () => /^[a-zA-Z0-9_-]{1,60}$/.test(process.env.OPS_INSTANCE_ID || '') ? process.env.OPS_INSTANCE_ID : 'app-' + createHash('sha256').update(hostname()).digest('hex').slice(0, 12);
export class Operations {
  constructor(repo, {
    instance = instanceId(),
    webhook = null
  } = {}) {
    this.repo = repo;
    this.instance = instance;
    this.webhook = webhook;
    this.recentHealth = new Map();
  }
  async scope(session){if(this.namespace)return this.namespace;const schema=await this.c('metadata').findOne({_id:'schema'},{session});const configured=process.env.OPS_APPLICATION_ID;this.namespace=digest(/^[a-zA-Z0-9_-]{1,60}$/.test(configured||'')?configured:String(schema?.instanceId||this.repo.config?.database||'nautica')).slice(0,24);return this.namespace;}
  c(name) {
    return this.repo.c(name);
  }
  async service(name, healthy) {
    const prior = this.recentHealth.get(name);
    if (prior?.healthy === healthy && Date.now() - prior.at < 60000) return;
    this.recentHealth.set(name, {
      healthy,
      at: Date.now()
    });
    if (!['razorpay', 'identity', 'smtp', 'textbee', 'documents'].includes(name)) return;
    await this.c('service_health').updateOne({
      _id: this.instance + ':' + name
    }, {
      $set: {
        instance: this.instance,
        service: name,
        healthy,
        checkedAt: new Date()
      }
    }, {
      upsert: true
    });
  }
  async observe(key, code, count, {
    notify = true,
    source = null
  } = {}) {
    if (!conditions[code] || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid operational condition.');
    return this.repo.transaction(async session => {
      let row = await this.c('operational_alerts').findOne({
        _id: key
      }, {
        session
      });
      const active = count > 0;
      if (!row && !active) return;
      if (!row) row = {
        _id: key,
        code,
        severity: conditions[code].severity,
        status: 'resolved',
        episode: 0,
        revision: 0
      };
      const opening = active && row.status === 'resolved',
        closing = !active && row.status !== 'resolved';
      if (opening) {
        row.episode++;
        row.status = 'open';
        row.firstSeen = new Date();
        delete row.acknowledgedAt;
        delete row.acknowledgedBy;
        delete row.resolvedAt;
      }
      if (closing) {
        row.status = 'resolved';
        row.resolvedAt = new Date();
      }
      if (source) row.source = source;
      const changed = opening || closing || row.count !== count;
      row.count = count;
      row.lastSeen = new Date();
      if (changed) row.revision++;
      await this.c('operational_alerts').replaceOne({
        _id: key
      }, row, {
        session,
        upsert: true
      });
      if (opening || closing) {
        const state = closing ? 'resolved' : 'open',
          id = 'ops:' + await this.scope(session)+':' + digest(key) + ':' + row.episode + ':' + state;
        await this.c('operations_audit').insertOne({
          _id: id,
          incident: key,
          episode: row.episode,
          action: state,
          at: new Date(),
          code
        }, {
          session
        });
        if (notify && code !== 'alert_delivery') await enqueueNotice(this.repo, {
          id,
          notice: incidentNotice(row, state),
          recipients: [{
            audience: 'admin'
          }]
        }, session);
        if (notify && this.webhook?.enabled) await this.c('ops_webhooks').updateOne({
          _id: id
        }, {
          $setOnInsert: {
            status: 'pending',
            attempts: 0,
            nextAttemptAt: 0,
            leaseUntil: 0,
            event: {
              eventId: id,
              incidentId: key,
              code,
              severity: row.severity,
              state,
              episode: row.episode,
              count,
              ...(row.source ? {
                source: row.source
              } : {}),
              at: new Date().toISOString()
            }
          }
        }, {
          upsert: true,
          session
        });
      }
      return alertView(row);
    });
  }
  async list(query = {}) {
    const offset = Math.max(0, Math.min(100000, parseInt(query.offset) || 0)),
      filter = query.status === 'active' ? {
        status: {
          $ne: 'resolved'
        }
      } : {};
    return this.repo.transaction(async session => ({
      alerts: (await this.c('operational_alerts').find(filter, {
        session
      }).sort({
        status: 1,
        lastSeen: -1,
        _id: 1
      }).skip(offset).limit(50).toArray()).map(alertView),
      total: await this.c('operational_alerts').countDocuments(filter, {
        session
      }),
      offset,
      limit: 50,
      instances: await this.c('ops_instances').find({
        retiredAt: {
          $exists: false
        }
      }, {
        session,
        projection: {
          _id: 1,
          lastSeen: 1
        }
      }).sort({
        _id: 1
      }).limit(100).toArray()
    }));
  }
  async acknowledge(id, username, input) {
    return this.repo.transaction(async session => {
      const row = await this.c('operational_alerts').findOne({
        _id: id
      }, {
        session
      });
      if (!row) throw new ApiError(404, 'Incident not found.');
      if (row.status === 'resolved') throw new ApiError(409, 'This incident has already recovered.');
      if (row.status === 'acknowledged') return alertView(row);
      if (row.revision !== input?.revision) throw new ApiError(409, 'Incident changed. Refresh before acknowledging.');
      row.status = 'acknowledged';
      row.acknowledgedAt = new Date();
      row.acknowledgedBy = username;
      row.revision++;
      await this.c('operational_alerts').replaceOne({
        _id: id
      }, row, {
        session
      });
      await this.c('operations_audit').insertOne({
        _id: randomUUID(),
        incident: id,
        episode: row.episode,
        action: 'acknowledged',
        actor: username,
        at: new Date()
      }, {
        session
      });
      return alertView(row);
    });
  }
  async retire(id, username, input) {
    await this.repo.transaction(async session => {
      const row = await this.c('ops_instances').findOne({
        _id: id
      }, {
        session
      });
      if (!row) throw new ApiError(404, 'App instance not found.');
      if (+row.lastSeen >= Date.now() - 300000 || new Date(row.lastSeen).toISOString() !== input?.lastSeen) throw new ApiError(409, 'Only an unchanged stopped instance can be retired.');
      await this.c('ops_instances').updateOne({
        _id: id
      }, {
        $set: {
          retiredAt: new Date()
        }
      }, {
        session
      });
      await this.c('operations_audit').insertOne({
        _id: randomUUID(),
        incident: 'instance:' + digest(id).slice(0, 24),
        action: 'retired',
        actor: username,
        at: new Date()
      }, {
        session
      });
    });
    return {
      ok: true
    };
  }
  async retryDelivery(username){return this.repo.transaction(async session=>{const email=await this.c('outbox').updateMany({event:'operational_alert',status:'failed'},{$set:{status:'pending',attempts:0,nextAttemptAt:0,leaseUntil:0}},{session});const sms=await this.c('sms_outbox').updateMany({event:'operational_alert',status:'failed',batchId:{$exists:false}},{$set:{status:'pending',attempts:0,nextAttemptAt:0}},{session});const webhook=await this.c('ops_webhooks').updateMany({status:'failed'},{$set:{status:'pending',attempts:0,nextAttemptAt:0,leaseUntil:0}},{session});await this.c('operations_audit').insertOne({_id:randomUUID(),incident:'alert_delivery',action:'delivery_retry',actor:username,at:new Date()},{session});return {email:email.modifiedCount,sms:sms.modifiedCount,webhook:webhook.modifiedCount};});}
  async history(id) {
    return {
      events: await this.c('operations_audit').find({
        incident: id
      }, {
        projection: {
          _id: 0,
          action: 1,
          actor: 1,
          at: 1,
          episode: 1,
          code: 1
        }
      }).sort({
        at: -1
      }).limit(100).toArray()
    };
  }
  async scan() {
    await this.scope();
    await this.c('ops_instances').updateOne({
      _id: this.instance
    }, {
      $set: {
        lastSeen: new Date()
      },
      $unset: {
        retiredAt: ''
      }
    }, {
      upsert: true
    });
    const conditionsToCount = [['payment_failures', 'payment_failures', {
      at: {
        $gte: new Date(Date.now() - 900000)
      }
    }], ['payment_attention', 'payments', {
      status: 'refund_required'
    }], ['refund_attention', 'refunds', {
      status: {
        $in: ['unknown', 'failed', 'manual_review']
      }
    }], ['refund_stalled', 'refunds', {
      status: 'pending',
      createdAt: {
        $lt: new Date(Date.now() - 7 * 86400000).toISOString()
      }
    }], ['notification_failures', 'outbox', {
      status: 'failed',
      event: {
        $ne: 'operational_alert'
      }
    }], ['notification_failures', 'sms_outbox', {
      status: {
        $in: ['failed', 'unknown', 'delivery_unknown']
      },
      event: {
        $ne: 'operational_alert'
      }
    }], ['notification_backlog', 'outbox', {
      status: 'pending',
      event: {
        $ne: 'operational_alert'
      },
      $or: [{
        createdAt: {
          $lt: new Date(Date.now() - 900000).toISOString()
        }
      }, {
        createdAt: {
          $exists: false
        }
      }]
    }], ['notification_backlog', 'sms_outbox', {
      status: 'pending',
      event: {
        $ne: 'operational_alert'
      },
      createdAt: {
        $lt: new Date(Date.now() - 900000).toISOString()
      }
    }], ['admin_setup', 'admins', {
      'mfa.secret': {
        $exists: false
      }
    }], ['admin_recovery', 'security_events', {
      action: 'admin_recovery_used',
      at: {
        $gte: new Date(Date.now() - 86400000)
      }
    }], ['admin_auth_failures', 'security_events', {
      action: {
        $in: ['admin_password_failed', 'admin_mfa_failed']
      },
      at: {
        $gte: new Date(Date.now() - 900000)
      }
    }], ['alert_delivery', 'outbox', {
      event: 'operational_alert',
      status: 'failed'
    }], ['alert_delivery', 'sms_outbox', {
      event: 'operational_alert',
      status: {
        $in: ['failed', 'unknown']
      }
    }], ['alert_delivery', 'ops_webhooks', {
      status: 'failed',
      attempts: {
        $gte: 5
      }
    }]];
    const counts = new Map();
    for (const [code, collection, filter] of conditionsToCount) counts.set(code, (counts.get(code) || 0) + (await this.c(collection).countDocuments(filter)));
    for (const [code, value] of counts) await this.observe(code, code, ['admin_auth_failures', 'payment_failures'].includes(code) ? value >= 5 ? value : 0 : value, {
      notify: code !== 'alert_delivery'
    });
    let invalidKeys = this.repo.mfa.configured ? 0 : 1;
    if (this.repo.mfa.configured) for await (const admin of this.c('admins').find({
      'mfa.secret': {
        $exists: true
      }
    })) {
      try {
        this.repo.mfa.box.open(admin.mfa.secret, admin.id);
      } catch {
        invalidKeys++;
      }
    }
    await this.observe('mfa:' + digest(this.instance).slice(0, 24), 'admin_mfa_unavailable', invalidKeys, {
      source: this.instance
    });
    for await (const alert of this.c('operational_alerts').find({
      code: 'admin_mfa_unavailable',
      status: {
        $ne: 'resolved'
      }
    })) {
      if (alert.source && (await this.c('ops_instances').findOne({
        _id: alert.source,
        retiredAt: {
          $exists: true
        }
      }))) await this.observe(alert._id, alert.code, 0);
    }
    for await (const health of this.c('service_health').find({})) {
      await this.observe('service:' + digest(health._id).slice(0, 24), health.service, health.healthy || (await this.c('ops_instances').findOne({
        _id: health.instance,
        retiredAt: {
          $exists: true
        }
      })) ? 0 : 1, {
        source: health.instance
      });
    }
    for await (const item of this.c('ops_instances').find({})) {
      await this.observe('instance:' + digest(item._id).slice(0, 24), 'worker_stale', !item.retiredAt && +item.lastSeen < Date.now() - 300000 ? 1 : 0, {
        source: item._id
      });
    }
  }
  async deliver({shouldStop=()=>false}={}) {
    if (!this.webhook?.enabled) return;
    await this.c('ops_webhooks').updateMany({status:'sending',attempts:{$gte:5},$expr:{$lte:['$leaseUntil',{$toLong:'$$NOW'}]}},{$set:{status:'failed',leaseUntil:0},$unset:{leaseToken:''}});
    for (let i = 0; i < 10&&!shouldStop(); i++) {
      const job = await this.c('ops_webhooks').findOneAndUpdate({
        attempts: {
          $lt: 5
        },
        $or: [{
          status: {
            $in: ['pending', 'failed']
          },
          $expr: {
            $lte: ['$nextAttemptAt', {
              $toLong: '$$NOW'
            }]
          }
        }, {
          status: 'sending',
          $expr: {
            $lte: ['$leaseUntil', {
              $toLong: '$$NOW'
            }]
          }
        }]
      }, [{
        $set: {
          status: 'sending',
          leaseToken: randomUUID(),
          leaseUntil: {
            $add: [{
              $toLong: '$$NOW'
            }, 30000]
          },
          attempts: {
            $add: ['$attempts', 1]
          }
        }
      }], {
        returnDocument: 'after'
      });
      if (!job) break;
      let success = false;
      try {
        success = await this.webhook.send(job.event, job._id);
      } catch {}
      await this.c('ops_webhooks').updateOne({
        _id: job._id,
        leaseToken: job.leaseToken
      }, {
        $set: {
          status: success ? 'sent' : 'failed',
          nextAttemptAt: Date.now() + 60000 * job.attempts,
          leaseUntil: 0
        },
        $unset: {
          leaseToken: ''
        }
      });
    }
  }
}
