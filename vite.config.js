import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
/**
 * A deployed build without these silently ships a broken app: the API client
 * falls back to localhost, and sign-in stops checking roster signatures
 * (README "Local development").
 */
var REQUIRED_PRODUCTION_ENV = ['VITE_API_URL', 'VITE_SIGNING_PUBLIC_KEY'];
/**
 * The modes a deployed build runs in: `production` (.env.production) and, on
 * Vercel preview deployments, `preview` (.env.preview, the development backend).
 */
var DEPLOYED_MODES = ['production', 'preview'];
/** The SQLite build every enrolled device opens: encrypted, IndexedDB VFS (src/data/database.ts). */
var SQLITE_WASM = 'assets/mc-wa-sqlite-async-*.wasm';
/** Workbox's default of 2 MB is below the SQLite WASM (2.4 MB raw). */
var MAX_PRECACHED_FILE_BYTES = 3 * 1024 * 1024;
var assertProductionEnv = function (mode) {
    var env = loadEnv(mode, process.cwd(), 'VITE_');
    var missing = REQUIRED_PRODUCTION_ENV.filter(function (name) { return !env[name]; });
    if (missing.length > 0) {
        throw new Error("".concat(mode, " build needs ").concat(missing.join(' and '), " (see README \"Deployment\")"));
    }
};
export default defineConfig(function (_a) {
    var command = _a.command, mode = _a.mode;
    if (command === 'build' && DEPLOYED_MODES.includes(mode))
        assertProductionEnv(mode);
    return {
        // QA previews use their own Vite config and the default cache. Sharing it
        // mixes React chunks between servers and breaks hooks on lazy-loaded screens.
        cacheDir: 'node_modules/.vite/app',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
                '@shared': path.resolve(__dirname, 'shared/src'),
            },
        },
        plugins: [
            react(),
            VitePWA({
                // A waiting update takes over only when every window of the app has
                // closed, so a new version never reloads the page under a half-filled form.
                registerType: 'prompt',
                // Registration is a few lines inlined into index.html, not a chunk
                // counted against the initial-JS budget.
                injectRegister: 'inline',
                manifest: {
                    name: 'Geneus Health',
                    short_name: 'Geneus',
                    description: 'Offline-first health records for community and primary health centres',
                    start_url: '/',
                    scope: '/',
                    display: 'standalone',
                    theme_color: '#0f766e',
                    background_color: '#f8f9fa',
                    icons: [
                        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    ],
                },
                workbox: {
                    // The whole shell, every route chunk and the PowerSync workers, so the
                    // app opens and signs in with no network at all. Of the four SQLite
                    // builds only the one enrolled devices open is precached; the
                    // synchronous OPFS builds are never loaded.
                    globPatterns: ['**/*.{html,js,css,woff2,svg,png}', SQLITE_WASM],
                    maximumFileSizeToCacheInBytes: MAX_PRECACHED_FILE_BYTES,
                    navigateFallback: 'index.html',
                    runtimeCaching: [
                        {
                            // The plaintext build, opened only by a device still retiring its
                            // pre-encryption database: kept once fetched, never refetched.
                            urlPattern: function (_a) {
                                var url = _a.url;
                                return url.pathname.startsWith('/assets/') && url.pathname.endsWith('.wasm');
                            },
                            handler: 'CacheFirst',
                            options: { cacheName: 'sqlite-wasm' },
                        },
                    ],
                },
            }),
        ],
        optimizeDeps: {
            // The PowerSync client ships web workers and WASM that Vite's dependency
            // pre-bundling would break (its own guidance for Vite projects).
            exclude: ['@powersync/web'],
        },
        worker: {
            format: 'es',
        },
    };
});
