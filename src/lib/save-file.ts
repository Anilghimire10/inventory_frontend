import { Capacitor } from '@capacitor/core';

/**
 * Hand the user a file: a download in the browser; in the Android app, the
 * phone's share sheet (save to Files or Drive, send by WhatsApp or email).
 *
 * The app's web view ignores `<a download>`, so every export used to do
 * nothing on a phone. There it is written to the app's cache and shared
 * from there; no storage permission is needed for that.
 */
export async function saveFile(filename: string, content: string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      await Share.share({ title: filename, files: [uri] });
    } catch (e) {
      // Closing the share sheet without picking anything isn't an error.
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked a moment later: some browsers start the download after click()
  // returns, and revoking at once cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
