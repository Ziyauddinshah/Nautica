import { passwordMatchesAsync } from './passwords.js';
/** @file Admin password challenges, encrypted TOTP enrollment, recovery codes and trusted reset. */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError, digest } from '../errors.js';
import { base32, matchingStep, secretBox } from './totp.js';
const bad = () => new ApiError(401, 'The verification code is incorrect, expired or already used.');
export class AdminMfa {
  constructor(repo, { key = process.env.ADMIN_MFA_ENCRYPTION_KEY, now = () => Date.now() } = {}) {
    this.repo = repo;
    this.box = secretBox(key);
    this.now = now;
    this.configured = this.box.configured;
  }
  c(name) {
    return this.repo.c(name);
  }
  ready() {
    if (!this.configured)
      throw new ApiError(503, 'Admin authentication is temporarily unavailable.');
  }
  async audit(action, username, session) {
    await this.c('security_events').insertOne(
      {
        _id: randomUUID(),
        action,
        actor: digest(username),
        at: new Date(this.now()),
      },
      {
        session,
      },
    );
  }
  async password(user, value) {
    if (typeof value !== 'string' || value.length > 256) return false;
    return passwordMatchesAsync(user, value, {});
  }
  async begin(username, password) {
    this.ready();
    const user = await this.c('admins').findOne({
      _id: username,
    });
    if (!(await this.password(user, password))) {
      await this.audit('admin_password_failed', username);
      throw new ApiError(401, 'Invalid admin username or password.');
    }
    if (!user.mfa?.secret && !user.mfaEnrollmentAllowed)
      throw new ApiError(
        403,
        'Admin security setup is required. Contact your system administrator.',
      );
    const token = randomBytes(32).toString('hex');
    await this.c('admin_challenges').insertOne({
      _id: digest(token),
      userId: username,
      authVersion: user.authVersion || 0,
      mfaVersion: user.mfaVersion || 0,
      enrollment: !user.mfa?.secret,
      attempts: 0,
      expiresAt: new Date(this.now() + 300000),
    });
    return {
      challengeToken: token,
      mfaRequired: true,
      enrollmentRequired: !user.mfa?.secret,
    };
  }
  async challenge(token, session) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw bad();
    const row = await this.c('admin_challenges').findOne(
      {
        _id: digest(token),
        expiresAt: {
          $gt: new Date(this.now()),
        },
        attempts: {
          $lt: 5,
        },
      },
      {
        session,
      },
    );
    if (!row) throw bad();
    const user = await this.c('admins').findOne(
      {
        _id: row.userId,
      },
      {
        session,
      },
    );
    if (
      !user ||
      (user.authVersion || 0) !== row.authVersion ||
      (user.mfaVersion || 0) !== row.mfaVersion
    )
      throw bad();
    return {
      row,
      user,
    };
  }
  async setup(token) {
    this.ready();
    return this.repo.transaction(async (session) => {
      const { row, user } = await this.challenge(token, session);
      if (!row.enrollment || user.mfa?.secret || !user.mfaEnrollmentAllowed) throw bad();
      const secret = row.candidate
        ? this.box.open(row.candidate, user.id)
        : base32(randomBytes(20));
      if (!row.candidate)
        await this.c('admin_challenges').updateOne(
          {
            _id: row._id,
          },
          {
            $set: {
              candidate: this.box.seal(secret, user.id),
            },
          },
          {
            session,
          },
        );
      return {
        secret,
        uri:
          'otpauth://totp/' +
          encodeURIComponent('Nautica:' + user.id) +
          '?' +
          new URLSearchParams({
            secret,
            issuer: 'Nautica',
            algorithm: 'SHA1',
            digits: '6',
            period: '30',
          }),
        expiresAt: row.expiresAt,
      };
    });
  }
  recovery(username, codes) {
    return codes.map((code) => digest(username + ':' + code.replaceAll('-', '').toLowerCase()));
  }
  newCodes() {
    return Array.from(
      {
        length: 8,
      },
      () => randomBytes(16).toString('hex').match(/.{8}/g).join('-'),
    );
  }
  factor(user, code, secret) {
    const step = matchingStep(secret, code, this.now(), user.mfa?.lastStep ?? -1);
    if (step !== null)
      return {
        step,
      };
    const normalized =
      typeof code === 'string' ? code.replaceAll('-', '').trim().toLowerCase() : '';
    if (!/^[a-f0-9]{32}$/.test(normalized)) return null;
    const hash = digest(user.id + ':' + normalized);
    return user.mfa?.recoveryHashes?.includes(hash)
      ? {
          recovery: hash,
        }
      : null;
  }
  async verify(token, input) {
    this.ready();
    const result = await this.repo.transaction(async (session) => {
      const { row, user } = await this.challenge(token, session);
      const secret = row.enrollment
        ? row.candidate && this.box.open(row.candidate, user.id)
        : user.mfa?.secret && this.box.open(user.mfa.secret, user.id);
      const code = typeof input?.code === 'string' ? input.code.trim() : '';
      const factor =
        secret &&
        (row.enrollment
          ? (() => {
              const step = matchingStep(secret, code, this.now());
              return step === null
                ? null
                : {
                    step,
                  };
            })()
          : this.factor(user, code, secret));
      if (!factor) {
        await this.c('admin_challenges').updateOne(
          {
            _id: row._id,
          },
          {
            $inc: {
              attempts: 1,
            },
          },
          {
            session,
          },
        );
        await this.audit('admin_mfa_failed', user.id, session);
        return null;
      }
      let recoveryCodes;
      if (row.enrollment) {
        if (user.mfa?.secret || !user.mfaEnrollmentAllowed) throw bad();
        recoveryCodes = this.newCodes();
        user.authVersion = (user.authVersion || 0) + 1;
        user.mfaVersion = (user.mfaVersion || 0) + 1;
        user.mfa = {
          secret: this.box.seal(secret, user.id),
          lastStep: factor.step,
          recoveryHashes: this.recovery(user.id, recoveryCodes),
          enabledAt: new Date(this.now()),
        };
        await this.c('admins').updateOne(
          {
            _id: user.id,
          },
          {
            $set: {
              mfa: user.mfa,
              mfaVersion: user.mfaVersion,
              authVersion: user.authVersion,
              mfaEnrollmentAllowed: false,
            },
          },
          {
            session,
          },
        );
        await this.c('sessions').deleteMany(
          {
            userId: user.id,
            role: 'admin',
          },
          {
            session,
          },
        );
        await this.audit('admin_mfa_enabled', user.id, session);
      } else {
        if (factor.recovery) {
          user.mfa.recoveryHashes = user.mfa.recoveryHashes.filter(
            (hash) => hash !== factor.recovery,
          );
          await this.audit('admin_recovery_used', user.id, session);
        } else user.mfa.lastStep = factor.step;
        await this.c('admins').updateOne(
          {
            _id: user.id,
          },
          {
            $set: {
              mfa: user.mfa,
            },
          },
          {
            session,
          },
        );
      }
      await this.c('admin_challenges').deleteOne(
        {
          _id: row._id,
        },
        {
          session,
        },
      );
      await this.audit('admin_mfa_login', user.id, session);
      const loggedIn = await this.repo.newSession(
        {
          ...user,
          factorVerified: true,
        },
        session,
        'admin',
      );
      return {
        ...loggedIn,
        ...(recoveryCodes
          ? {
              recoveryCodes,
            }
          : {}),
      };
    });
    if (!result) throw bad();
    return result;
  }
  async status(username) {
    const user = await this.c('admins').findOne({
      _id: username,
    });
    return {
      enabled: Boolean(user?.mfa?.secret),
      recoveryCodesRemaining: user?.mfa?.recoveryHashes?.length || 0,
      enabledAt: user?.mfa?.enabledAt,
      recentEvents: await this.c('security_events')
        .find(
          {
            actor: digest(username),
          },
          {
            projection: {
              _id: 0,
              action: 1,
              at: 1,
            },
          },
        )
        .sort({
          at: -1,
        })
        .limit(10)
        .toArray(),
    };
  }
  async rotate(username, input) {
    this.ready();
    const result = await this.repo.transaction(async (session) => {
      const user = await this.c('admins').findOne(
        {
          _id: username,
        },
        {
          session,
        },
      );
      if (!(await this.password(user, input?.password))) return null;
      const factor = this.factor(user, input?.code, this.box.open(user.mfa.secret, username));
      if (!factor) {
        await this.audit('admin_mfa_failed', username, session);
        return null;
      }
      const codes = this.newCodes();
      await this.c('admins').updateOne(
        {
          _id: username,
        },
        {
          $set: {
            'mfa.recoveryHashes': this.recovery(username, codes),
            ...(!factor.recovery
              ? {
                  'mfa.lastStep': factor.step,
                }
              : {}),
          },
        },
        {
          session,
        },
      );
      await this.audit('admin_recovery_rotated', username, session);
      return {
        recoveryCodes: codes,
      };
    });
    if (!result) throw bad();
    return result;
  }
  // Trusted server-console recovery only; never exposed through an HTTP endpoint.
  async reset(username, password) {
    this.ready();
    return this.repo.transaction(async (session) => {
      const user = await this.c('admins').findOne(
        {
          _id: username,
        },
        {
          session,
        },
      );
      if (!(await this.password(user, password)))
        throw new ApiError(401, 'Invalid admin username or password.');
      await this.c('admins').updateOne(
        {
          _id: username,
        },
        {
          $unset: {
            mfa: '',
          },
          $set: {
            mfaEnrollmentAllowed: true,
          },
          $inc: {
            authVersion: 1,
            mfaVersion: 1,
          },
        },
        {
          session,
        },
      );
      await this.c('sessions').deleteMany(
        {
          userId: username,
          role: 'admin',
        },
        {
          session,
        },
      );
      await this.c('admin_challenges').deleteMany(
        {
          userId: username,
        },
        {
          session,
        },
      );
      await this.audit('admin_mfa_reset', username, session);
    });
  }
}
