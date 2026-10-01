import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { unlockSecureStorage } from '@/lib/secureStorage';
import '@/index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// The device's secrets (credential, PINs, database key) are read while
// rendering, so they are decrypted into memory first.
unlockSecureStorage().then(
  () =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  () =>
    root.render(
      <p style={{ padding: 24, fontFamily: 'sans-serif' }}>
        This browser cannot keep Geneus data safely on this phone. Turn off private browsing, or use Chrome, and
        reopen the app.
      </p>,
    ),
);
