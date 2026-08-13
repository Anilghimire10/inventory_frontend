import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inventorymanager.app',
  appName: 'Inventory Manager',
  // Next.js static export (`BUILD_TARGET=mobile next build`) emits to `out/`.
  webDir: 'out',
  server: {
    // Allow plain HTTP calls (e.g. http://10.0.2.2:3000 during local testing).
    // REMOVE for production — your live API should be HTTPS.
    cleartext: true,
  },
};

export default config;
