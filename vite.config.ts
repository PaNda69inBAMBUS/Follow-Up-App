/// <reference types="vitest" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Every file under [dir], as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full).map((f) => `${name}/${f}`) : [name];
  });
}

/**
 * Writes dist/sw.js: a service worker that stores every file of this build on the phone, so the
 * app opens without internet. Its cache name changes whenever any file changes, which makes the
 * phone download the new version (in the background) and drop the old one.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    enforce: 'post', // after Vite has added index.html and every asset to the bundle
    generateBundle(_, bundle) {
      const publicDir = join(process.cwd(), 'public');
      const publicFiles = listFiles(publicDir);
      const files = ['index.html', ...Object.keys(bundle).filter((f) => f !== 'index.html'), ...publicFiles];
      const hash = createHash('sha256');
      for (const f of Object.keys(bundle).sort()) {
        const item = bundle[f];
        hash.update(f).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const f of publicFiles) hash.update(f).update(readFileSync(join(publicDir, f)));
      const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync(join(process.cwd(), 'src', 'sw-template.js'), 'utf8')
          .replace('__VERSION__', version)
          .replace('__FILES__', JSON.stringify(files.map((f) => `./${relative('.', f).replace(/\\/g, '/')}`), null, 2)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
  // Relative paths so the app works from any hosting sub-folder (e.g. GitHub Pages).
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true },
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
});
