/* Home-screen app support: offline caching (service worker) and "is it installed?". */

/** True when opened from the home screen icon (not inside Safari). */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** True on iPhone / iPad Safari, where "Add to Home Screen" is the way to install. */
export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Registers the service worker that keeps the app's files on the phone, so it opens without
 * internet. A new version is downloaded in the background and used from the next start.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline support unavailable', e));
  });
}
