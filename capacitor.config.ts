import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inventorymanager.app',
  appName: 'Inventory Manager',
  // Next.js static export (`BUILD_TARGET=mobile next build`) emits to `out/`.
  webDir: 'out',
  server: {
    // Plain-HTTP calls are off unless explicitly asked for, so a release build
    // can't quietly ship able to talk to an unencrypted API. `npm run
    // sync:dev` turns them on for an emulator/LAN backend such as
    // http://10.0.2.2:3000. `cap sync` writes this into the Android manifest,
    // so re-sync after switching.
    cleartext: process.env.CAP_CLEARTEXT === 'true',
    // Paying online: eSewa, Khalti and connectIPS open inside the app. eSewa
    // and Khalti send the owner back to https://localhost/payment-return/,
    // which the app serves; connectIPS to the web app's URL registered with
    // NCHL. Any other site still opens in the browser.
    allowNavigation: ['esewa.com.np', '*.esewa.com.np', 'khalti.com', '*.khalti.com', 'connectips.com', '*.connectips.com'],
  },
};

export default config;
