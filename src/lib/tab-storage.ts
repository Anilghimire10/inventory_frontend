import { Capacitor } from '@capacitor/core';

/**
 * Storage for what belongs to one signed-in session: the token, the branch
 * being looked at.
 *
 * In a browser that is sessionStorage, so two tabs on one machine can be
 * signed in as different people without overwriting each other. The Android
 * app has no tabs, and its web view drops sessionStorage whenever the system
 * closes the app -- so a cashier was signed out every time the phone killed
 * it in the background. There, localStorage keeps the session until sign-out.
 */
export function tabStorage(): Storage {
  return Capacitor.isNativePlatform() ? localStorage : sessionStorage;
}
