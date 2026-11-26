/** @file Operator TextBee configuration verification against the intended provider environment. */
import { createTextbeeGateway, textbeeConfig } from '../server/services/textbee.js';
try {
  const config = textbeeConfig({ ...process.env, SMS_ENABLED: 'true' });
  if (!config.configured)
    throw Object.assign(new Error('SMS configuration missing.'), { code: 'SMS_NOT_CONFIGURED' });
  await createTextbeeGateway({ config }).verify();
  console.log('TextBee API key and selected device verified. No SMS was sent.');
  if (!config.adminTo)
    console.log('Admin SMS is not enabled: set SMS_ADMIN_TO to an international phone number.');
  console.log('Keep the TextBee phone online with an active SIM and SMS permissions.');
} catch (error) {
  console.error(
    error.code === 'SMS_NOT_CONFIGURED'
      ? 'Set TEXTBEE_API_KEY and a valid TEXTBEE_DEVICE_ID in private .env.'
      : error.code === 'SMS_REQUEST_REJECTED'
        ? 'TextBee rejected access. Check the API key, device ID and device status.'
        : 'TextBee verification failed. Check private settings, network and device access.',
  );
  process.exitCode = 1;
}
