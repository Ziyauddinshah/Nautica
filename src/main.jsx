import React from 'react';
import { createRoot } from 'react-dom/client';
import { consumeResetToken } from './lib/resetLink.js';
import App from './App.jsx';
import './styles.css';

const resetToken=consumeResetToken(window.location,window.history);
createRoot(document.getElementById('root')).render(<React.StrictMode><App resetToken={resetToken}/></React.StrictMode>);
