/** @file Browser entry: mounts the React application and providers. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { consumeResetToken, consumeVerificationToken } from './lib/resetLink.js';
import App from './App.jsx';
import './styles.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/700.css';
import { I18nProvider } from './i18n/I18nProvider.jsx';

const verificationToken = consumeVerificationToken(window.location, window.history);
const resetToken = consumeResetToken(window.location, window.history);
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App resetToken={resetToken} verificationToken={verificationToken} />
    </I18nProvider>
  </React.StrictMode>,
);
