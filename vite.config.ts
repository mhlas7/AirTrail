import { o7Icon } from '@o7/icon/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA, type VitePWAOptions } from '@vite-pwa/sveltekit';

const pwaOptions: VitePWAOptions = {
  registerType: 'autoUpdate',
  injectRegister: 'script',
  strategies: 'generateSW',
  includeAssets: [
    'favicon.png',
    'favicon.svg',
    'apple-touch-icon.png',
    'countries.geojson',
  ],
  manifest: {
    name: 'AirTrail',
    short_name: 'AirTrail',
    description: 'A modern, open-source personal flight tracking system',
    categories: ['travel', 'navigation', 'utilities'],
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#3c83f6',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/favicon.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,png,svg,geojson}'],
    sourcemap: true,
    cleanupOutdatedCaches: true,
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
    runtimeCaching: [
      /**
       * Static assets cache: images and geojson file
       */
      {
        urlPattern: /\.(?:png|svg|geojson)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'airtrail-static',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      /**
       * API data cache: flight data
       */
      {
        urlPattern: /\/flight\/.*$/i,
        method: 'GET',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'airtrail-userdata',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
    ],
  },
  devOptions: {
    enabled: true,
  },
  minify: false,
  includeManifestIcons: false,
  disable: false
};

export default defineConfig({
  plugins: [o7Icon(), tailwindcss(), sveltekit(), SvelteKitPWA(pwaOptions)],
});
