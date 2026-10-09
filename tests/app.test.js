import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const read = (file) => fs.readFileSync(path.join(appRoot, file), 'utf8');

test('storage helpers report browser storage failures instead of throwing', async () => {
  const { default: Storage } = await import('../src/storage/storage.ts');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem() { throw new DOMException('Storage is full', 'QuotaExceededError'); },
      removeItem() { throw new DOMException('Storage is blocked', 'SecurityError'); },
      getItem() { throw new DOMException('Storage is blocked', 'SecurityError'); },
      clear() { throw new DOMException('Storage is blocked', 'SecurityError'); },
    },
  });

  assert.equal(Storage.set('key', 'value'), false);
  assert.equal(Storage.remove('key'), false);
  assert.equal(Storage.clear(), false);
  assert.equal(Storage.get('key', 'fallback'), 'fallback');
});

test('index loads the React application entry point', () => {
  const index = read('index.html');
  assert.match(index, /id="root"/);
  assert.match(index, /type="module"\s+src="\/src\/main\.tsx"/);
});

test('React app keeps all navigation pages and now playing controls', () => {
  const app = read('src/App.tsx');
  ['home', 'discover', 'search', 'library', 'profile'].forEach((page) => {
    assert.match(app, new RegExp(`"${page}"`));
  });
  assert.match(app, /requested === "settings"/);
  assert.match(app, /aria-label=\{item === "profile" \? "Profile and settings"/);
  ['nowPlayingOverlay', 'nowPlayingArtwork', 'nowPlayingTitle', 'nowPlayingArtist'].forEach((id) => {
    assert.match(app, new RegExp(id));
  });
});

test('audius tracks expose a playable stream url', async () => {
  const { default: AudiusAPI } = await import('../src/api/audius.ts');
  const normalized = AudiusAPI.normalize({
    id: 'abc',
    title: 'Audius Demo',
    user: { name: 'Demo Artist' },
    artwork: { '480x480': 'https://example.com/art.jpg' },
    duration: 120,
    permalink: '/demo/demo',
    genre: 'Electronic',
    stream: {
      url: 'https://example.com/stream.mp3'
    }
  });

  assert.equal(normalized.source, 'audius');
  assert.equal(normalized.streamUrl, 'https://example.com/stream.mp3');
});
