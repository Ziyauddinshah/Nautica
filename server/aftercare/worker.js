/** @file Background coordination for cancellation, refund and document reminder jobs, with bounded work and graceful stopping. */
// Every replica may run this worker: refund claims and expiry-scan leases live in MongoDB.
export function aftercareWorker({
  refunds,
  reminders,
  emailService,
  smsService,
  remindersEnabled = true,
}) {
  let running = null,
    timer,
    stopped = false;
  function kick() {
    if (running || stopped) return running;
    running = (async () => {
      await refunds.drain({
        shouldStop: () => stopped,
      });
      if (remindersEnabled && !stopped) await reminders.run(undefined, () => stopped);
      emailService?.kick();
      smsService?.kick();
      return {
        ok: true,
      };
    })()
      .catch(() => {
        console.error('Aftercare worker paused; durable tasks remain available.');
        return {
          ok: false,
        };
      })
      .finally(() => {
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
    },
  };
}
