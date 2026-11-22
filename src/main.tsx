import '@/lib/platform';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { isPublicPath } from '@/public/publicPath';
import '@/index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

const renderFailure = (message: string) => {
  root.render(
    <p style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {message}
    </p>,
  );
};

const startPublicApp = async () => {
  const { PublicDocumentsApp } = await import('@/public/PublicDocumentsApp');

  root.render(
    <React.StrictMode>
      <PublicDocumentsApp />
    </React.StrictMode>,
  );
};

const startStaffApp = async () => {
  const [{ default: App }, { unlockSecureStorage }, { recoverWorkspaceActivation }] = await Promise.all([
    import('@/app/App'),
    import('@/lib/secureStorage'),
    import('@/data/facilityWorkspaces'),
  ]);

  // The device's secrets (credential, PINs, database key) are read while
  // rendering, so they are decrypted into memory first.
  await unlockSecureStorage();
  await recoverWorkspaceActivation();

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

if (isPublicPath(window.location.pathname)) {
  // Patient links must work without starting the staff app or opening its device storage.
  void startPublicApp().catch(() => renderFailure('This page could not be opened. Check your connection and reload.'));
} else {
  void startStaffApp().catch(() => renderFailure(
    'This browser cannot keep Geneus data safely on this phone. Turn off private browsing, or use Chrome, and reopen the app.',
  ));
}
