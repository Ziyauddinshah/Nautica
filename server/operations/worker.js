import { mkdir, open, lstat, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { emailConfig, smtpOptions } from '../email.js';
import { noticeMessage } from '../aftercare/notices.js';
import { incidentNotice } from './catalog.js';
import { digest } from '../errors.js';
export function independentAlerts({
  webhook,
  config = emailConfig(),
  transport,
  throttleDirectory = join(tmpdir(), 'nautica-ops-' + (process.getuid?.() ?? 'local'))
} = {}) {
  let cleaned = false;
  async function reserveEmail(id) {
    try {
      await mkdir(throttleDirectory, {
        recursive: true,
        mode: 0o700
      });
      const directory = await lstat(throttleDirectory);
      if (!directory.isDirectory() || directory.isSymbolicLink() || process.platform !== 'win32' && ((directory.mode & 0o077) !== 0 || directory.uid !== process.getuid())) throw new Error();
      if (!cleaned) {
        cleaned = true;
        for (const name of await readdir(throttleDirectory)) {
          if (!/^[a-f0-9]{64}\.sent$/.test(name)) continue;
          const path = join(throttleDirectory, name),
            entry = await lstat(path);
          if (entry.isFile() && Date.now() - entry.mtimeMs > 172800000) await unlink(path).catch(() => {});
        }
      }
      const file = await open(join(throttleDirectory, digest(id) + '.sent'), 'wx', 0o600);
      await file.close();
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') console.error('OPS_LOCAL_THROTTLE_UNAVAILABLE');
      return false;
    }
  }
  const mailer = config.configured ? transport || nodemailer.createTransport(smtpOptions(config)) : null;
  return {
    async send(event, id) {
      const results = await Promise.allSettled([webhook?.enabled ? webhook.send(event, id) : Promise.resolve(false), mailer ? (async () => {
        if (!(await reserveEmail(id))) return false;
        return mailer.sendMail(noticeMessage(incidentNotice({
          _id: event.incidentId,
          code: 'database',
          count: 1,
          source: event.source
        }, event.state), config, config.adminTo, `<${digest(id)}@nautica.invalid>`)).then(result => Boolean(result.accepted?.some(value => (typeof value === 'string' ? value : value.address) === config.adminTo)));
      })() : Promise.resolve(false)]);
      return results.some(result => result.status === 'fulfilled' && result.value === true);
    },
    close() {
      mailer?.close?.();
    }
  };
}
export function operationsWorker({
  repo,
  sender,
  emailService,
  smsService,
  now = () => Date.now()
}) {
  let running = null,
    timer,
    stopped = false,
    outageAt = null,
    lastSent = 0;
  async function tick() {
    try {
      await repo.health();
    } catch {
      if (outageAt === null) outageAt = now();
      if (now() - lastSent >= 900000 || lastSent === 0) {
        lastSent = now();
        const incidentId = 'database:' + digest(repo.ops.instance).slice(0, 24),
          id = 'ops:'+digest(/^[a-zA-Z0-9_-]{1,60}$/.test(process.env.OPS_APPLICATION_ID||'')?process.env.OPS_APPLICATION_ID:(repo.ops.namespace||'nautica')).slice(0,24)+':' + incidentId + ':open:' + Math.floor(now() / 900000);
        await sender.send({
          eventId: id,
          incidentId,
          code: 'database',
          source: repo.ops.instance,
          severity: 'critical',
          state: 'open',
          at: new Date(now()).toISOString()
        }, id);
        console.error('OPS_DATABASE_UNAVAILABLE');
      }
      return;
    }
    const key = 'database:' + digest(repo.ops.instance).slice(0, 24);
    if (outageAt !== null) {
      await repo.ops.observe(key, 'database', 1, {
        notify: false,
        source: repo.ops.instance
      });
      outageAt = null;
      lastSent = 0;
    }
    await repo.ops.observe(key, 'database', 0, {
      source: repo.ops.instance
    });
    await repo.ops.scan();
    await repo.ops.deliver({shouldStop:()=>stopped});
    emailService?.kick();
    smsService?.kick();
  }
  function kick() {
    if (running || stopped) return running;
    running = tick().catch(() => console.error('OPS_MONITORING_PAUSED')).finally(() => {
      running = null;
    });
    return running;
  }
  return {
    kick,
    start() {
      stopped = false;
      kick();
      timer = setInterval(kick, 60000);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
      sender.close?.();
    }
  };
}
