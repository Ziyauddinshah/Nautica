import { randomUUID, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../errors.js';
import { smsPhone } from '../services/textbee.js';
const fail = () => new ApiError(400, 'The code is incorrect or expired. Request a new code if needed.');
const normalized = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
export class OwnerVerification {
  constructor(repo, {
    sms = null,
    provider = null,
    secret = process.env.MOBILE_OTP_SECRET || ''
  } = {}) {
    this.repo = repo;
    this.sms = sms;
    this.provider = provider;
    this.secret = secret;
  }
  c(name) {
    return this.repo.c(name);
  }
  mobileEnabled() {
    return this.secret.length >= 32 && Boolean(this.sms?.enabled);
  }
  async status(userId) {
    const row = await this.c('owner_verifications').findOne({
        _id: userId
      }),
      user = await this.c('users').findOne({
        _id: userId
      });
    const now = Date.now(),
      mobile = Boolean(row?.mobile?.expiresAt > new Date(now) && row.mobile.phone === smsPhone(user?.phone)),
      identity = Boolean(row?.identity?.expiresAt > new Date(now) && normalized(row.identity.name) === normalized(user?.name));
    return {
      mobileEnabled: this.mobileEnabled(),
      identityEnabled: Boolean(this.provider?.enabled),
      mobileVerified: mobile,
      identityVerified: identity,
      phone: row?.mobile?.phone || smsPhone(user?.phone) || '',
      identity: identity ? {
        name: row.identity.name,
        method: row.identity.method,
        verifiedAt: row.identity.verifiedAt,
        expiresAt: row.identity.expiresAt
      } : null
    };
  }
  async require(userId, session) {
    if (typeof userId !== 'string') throw new ApiError(409, 'A verified boat owner is required.');
    const row = await this.c('owner_verifications').findOne({
        _id: userId
      }, {
        session
      }),
      user = await this.c('users').findOne({
        _id: userId
      }, {
        session
      });
    if (!row || !user || row.mobile?.expiresAt <= new Date() || !row.mobile?.expiresAt || row.identity?.expiresAt <= new Date() || !row.identity?.expiresAt || row.mobile.phone !== smsPhone(user.phone) || normalized(row.identity.name) !== normalized(user.name)) throw new ApiError(409, 'Verify the boat owner identity and mobile number first.');
    if (session) await this.c('owner_verifications').updateOne({
      _id: userId
    }, {
      $inc: {
        fence: 1
      }
    }, {
      session
    });
  }
  hash(userId, id, phone, code) {
    return createHmac('sha256', this.secret).update(JSON.stringify([userId, id, phone, code])).digest('hex');
  }
  async sendCode(userId, input) {
    if (!this.mobileEnabled()) throw new ApiError(503, 'Mobile verification is not configured.');
    const phone = smsPhone(input?.phone);
    if (!phone || !/^\+91[6-9]\d{9}$/.test(phone) || input.consent !== true) throw new ApiError(400, 'Enter an Indian mobile number and agree to receive a verification code.');
    const id = randomUUID(),
      code = String(randomInt(0, 1000000)).padStart(6, '0'),
      now = Date.now();
    await this.repo.transaction(async session => {
      const current = await this.c('mobile_challenges').findOne({
        _id: userId
      }, {
        session
      });
      if (current?.nextSendAt > now) throw new ApiError(429, 'Wait one minute before requesting another code.');
      await this.c('mobile_challenges').replaceOne({
        _id: userId
      }, {
        _id: userId,
        id,
        phone,
        hash: this.hash(userId, id, phone, code),
        attempts: 0,
        status: 'sending',
        expiresAt: new Date(now + 300000),
        nextSendAt: now + 60000
      }, {
        session,
        upsert: true
      });
    });
    try {
      await this.sms.send(phone, input.language === 'hi' ? 'Nautica: आपका मोबाइल सत्यापन कोड ' + code + ' है। यह 5 मिनट तक मान्य है। इसे किसी से साझा न करें।' : 'Nautica: Your mobile verification code is ' + code + '. Valid for 5 minutes. Do not share this code.');
      await this.c('mobile_challenges').updateOne({
        _id: userId,
        id,
        status: 'sending'
      }, {
        $set: {
          status: 'sent'
        }
      });
    } catch {
      await this.c('mobile_challenges').updateOne({
        _id: userId,
        id
      }, {
        $set: {
          status: 'failed'
        },
        $unset: {
          hash: ''
        }
      });
      throw new ApiError(503, 'The verification code could not be sent. Try again later.');
    }
    return {
      sent: true,
      expiresIn: 300,
      retryAfter: 60
    };
  }
  async verifyCode(userId, input) {
    if (!this.mobileEnabled()) throw new ApiError(503, 'Mobile verification is not configured.');
    if (typeof input?.code !== 'string' || !/^\d{6}$/.test(input.code)) throw fail();
    const result = await this.repo.transaction(async session => {
      const row = await this.c('mobile_challenges').findOne({
        _id: userId
      }, {
        session
      });
      if (!row || row.status !== 'sent' || row.expiresAt <= new Date() || row.attempts >= 5) return false;
      const actual = Buffer.from(this.hash(userId, row.id, row.phone, input.code), 'hex'),
        expected = Buffer.from(row.hash, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        await this.c('mobile_challenges').updateOne({
          _id: userId,
          id: row.id
        }, {
          $inc: {
            attempts: 1
          }
        }, {
          session
        });
        return false;
      }
      await this.c('mobile_challenges').updateOne({
        _id: userId,
        id: row.id
      }, {
        $set: {
          status: 'used'
        },
        $unset: {
          hash: ''
        }
      }, {
        session
      });
      await this.c('users').updateOne({
        _id: userId
      }, {
        $set: {
          phone: row.phone
        }
      }, {
        session
      });
      await this.c('owner_verifications').updateOne({
        _id: userId
      }, {
        $set: {
          mobile: {
            phone: row.phone,
            verifiedAt: new Date(),
            consentVersion: 'owner-mobile-v1',
            expiresAt: new Date(Date.now() + 180 * 86400000)
          }
        },
        $inc: {
          fence: 1
        }
      }, {
        upsert: true,
        session
      });
      return true;
    });
    if (!result) throw fail();
    return {
      verified: true
    };
  }
  async startIdentity(userId, input) {
    if (!this.provider?.enabled) throw new ApiError(503, 'Identity verification is not configured.');
    if (!['aadhaar', 'alternative'].includes(input?.method) || input.consent !== true) throw new ApiError(400, 'Choose an identity verification method and give your consent.');
    const id = randomUUID();
    await this.repo.transaction(async session => {
      const row = await this.c('owner_verifications').findOne({
        _id: userId
      }, {
        session
      });
      if (row?.identityRequest?.startedAt > new Date(Date.now() - 60000)) throw new ApiError(429, 'Wait one minute before starting identity verification again.');
      await this.c('owner_verifications').updateOne({
        _id: userId
      }, {
        $set: {
          identityRequest: {
            id,
            method: input.method,
            startedAt: new Date(),
            status: 'starting',
            consentVersion: 'owner-identity-v1'
          }
        },
        $inc: {
          fence: 1
        }
      }, {
        session,
        upsert: true
      });
    });
    const result = await this.provider.start({
      userId,
      requestId: id,
      method: input.method
    });
    const updated = await this.c('owner_verifications').updateOne({
      _id: userId,
      'identityRequest.id': id
    }, {
      $set: {
        'identityRequest.providerId': result.id,
        'identityRequest.status': 'pending'
      }
    });
    if (!updated.matchedCount) throw new ApiError(409, 'Verification changed. Start again.');
    return {
      url: result.url
    };
  }
  async finishIdentity(userId) {
    if (!this.provider?.enabled) throw new ApiError(503, 'Identity verification is not configured.');
    const row = await this.c('owner_verifications').findOne({
        _id: userId
      }),
      request = row?.identityRequest;
    if (!request?.providerId) throw new ApiError(400, 'Start identity verification first.');
    const result = await this.provider.result(request.providerId);
    if (result.status !== 'verified') return {
      verified: false
    };
    const expiresAt = new Date(result.expiresAt);
    if (result.subject !== userId || result.requestId !== request.id || result.id !== request.providerId || result.method !== request.method || typeof result.name !== 'string' || result.name.length < 2 || result.name.length > 120 || !Number.isFinite(+expiresAt) || expiresAt <= new Date() || expiresAt > new Date(Date.now() + 366 * 86400000) || result.consentVersion !== 'owner-identity-v1') throw new ApiError(409, 'Identity verification result could not be confirmed.');
    await this.repo.transaction(async session => {
      const current = await this.c('owner_verifications').findOne({
          _id: userId
        }, {
          session
        }),
        user = await this.c('users').findOne({
          _id: userId
        }, {
          session
        });
      if (current?.identityRequest?.id !== request.id) throw new ApiError(409, 'Verification changed. Start again.');
      if (normalized(user?.name) !== normalized(result.name)) throw new ApiError(409, 'The verified legal name must match your account name. Contact support.');
      await this.c('owner_verifications').updateOne({
        _id: userId
      }, {
        $set: {
          identity: {
            name: result.name.trim(),
            method: result.method,
            reference: request.providerId,
            consentVersion: request.consentVersion,
            consentedAt: request.startedAt,
            verifiedAt: new Date(),
            expiresAt
          },
          'identityRequest.status': 'verified'
        },
        $inc: {
          fence: 1
        }
      }, {
        session
      });
    });
    return {
      verified: true
    };
  }
}
