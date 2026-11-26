/** @file Operator SMTP connectivity verification; keep server credentials private. */
import nodemailer from 'nodemailer';
import { emailConfig, smtpOptions } from '../server/email.js';
const config = emailConfig();
if (!config.configured) {
  console.error(config.reason);
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport(smtpOptions(config));
  try {
    await transport.verify();
    console.log('Gmail SMTP connection and authentication verified. No email was sent.');
    if (!config.siteOrigin)
      console.log(
        'Password-reset email is disabled until PUBLIC_ORIGIN is set to a trusted app origin.',
      );
  } catch (error) {
    console.error(
      error.code === 'EAUTH'
        ? 'Gmail authentication failed. Check SMTP_USER and the Google App Password.'
        : 'Gmail SMTP verification failed. Check network access, TLS and server configuration.',
    );
    process.exitCode = 1;
  } finally {
    transport.close?.();
  }
}
