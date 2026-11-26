/** @file Account-bound email proof with expiring hashed tokens and transactional single use. */
import { randomBytes } from 'node:crypto';
import { digest, ApiError } from '../errors.js';
export const emailVerified = (row) =>
  Boolean(row?.emailVerifiedAt && row.verifiedEmail === row.email);
export class EmailProof {
  constructor(repo) {
    this.repo = repo;
  }
  async require(id, session) {
    const user = await this.repo
      .c('users')
      .findOne(
        { _id: id },
        session ? { session } : { readConcern: { level: 'linearizable' }, maxTimeMS: 5000 },
      );
    if (!emailVerified(user))
      throw new ApiError(403, 'Verify your email address before booking or registering a boat.');
    return user;
  }
  async request(id, { enabled, siteOrigin } = {}) {
    if (!enabled || !siteOrigin)
      throw new ApiError(
        503,
        'Verification email is temporarily unavailable. Please try again later.',
      );
    const user = await this.repo.c('users').findOne({ _id: id });
    if (!user || emailVerified(user)) return null;
    const token = randomBytes(32).toString('hex');
    await this.repo.c('email_verifications').replaceOne(
      { userId: id },
      {
        _id: id,
        tokenHash: digest(token),
        userId: id,
        email: user.email,
        version: user.authVersion || 0,
        expiresAt: new Date(Date.now() + 900000),
      },
      { upsert: true },
    );
    const link = new URL('/verify-email', siteOrigin);
    link.hash = 'token=' + token;
    return { email: user.email, link: link.href };
  }
  async verify(id, token) {
    const bad = () =>
      new ApiError(
        400,
        'This verification link is invalid or expired. Sign in and request a new link.',
      );
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw bad();
    return this.repo.transaction(async (session) => {
      const proof = await this.repo
        .c('email_verifications')
        .findOne(
          { _id: id, tokenHash: digest(token), userId: id, expiresAt: { $gt: new Date() } },
          { session },
        );
      const user = proof && (await this.repo.c('users').findOne({ _id: id }, { session }));
      if (!user || user.email !== proof.email || (user.authVersion || 0) !== proof.version)
        throw bad();
      await this.repo
        .c('users')
        .updateOne(
          { _id: id },
          { $set: { verifiedEmail: user.email, emailVerifiedAt: new Date().toISOString() } },
          { session },
        );
      await this.repo.c('email_verifications').deleteMany({ userId: id }, { session });
      await this.repo
        .c('outbox')
        .updateMany(
          { status: 'verification_required', recipient: user.email },
          { $set: { status: 'pending', nextAttemptAt: 0 } },
          { session },
        );
      return { ok: true };
    });
  }
}
