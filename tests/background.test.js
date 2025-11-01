import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetManifestFromPublicManifest,
  readFromAssetManifest
} from '../src/ui/background.js';

const PUBLIC_MANIFEST_KEY = '__ASTROCAT_PUBLIC_MANIFEST__';

test('createAssetManifestFromPublicManifest normalizes entries and filters by extension', (t) => {
  const originalManifest = globalThis[PUBLIC_MANIFEST_KEY];
  t.after(() => {
    if (originalManifest === undefined) {
      delete globalThis[PUBLIC_MANIFEST_KEY];
    } else {
      globalThis[PUBLIC_MANIFEST_KEY] = originalManifest;
    }
  });

  globalThis[PUBLIC_MANIFEST_KEY] = {
    'assets/Example.PNG': '/compiled/example.123.png',
    'textures/Second.svg': '/compiled/second.svg',
    'textures/Third.txt': '/compiled/third.txt',
    'assets/Example.png': '/compiled/example-lower.png'
  };

  const manifest = createAssetManifestFromPublicManifest({
    extensions: ['.png', '.svg']
  });

  assert.deepEqual(manifest, {
    './assets/Example.PNG': '/compiled/example.123.png',
    './assets/example.png': '/compiled/example.123.png',
    './assets/Second.svg': '/compiled/second.svg',
    './assets/second.svg': '/compiled/second.svg',
    './assets/Example.png': '/compiled/example-lower.png'
  });
});

test('createAssetManifestFromPublicManifest returns null when manifest is unavailable', (t) => {
  const originalManifest = globalThis[PUBLIC_MANIFEST_KEY];
  t.after(() => {
    if (originalManifest === undefined) {
      delete globalThis[PUBLIC_MANIFEST_KEY];
    } else {
      globalThis[PUBLIC_MANIFEST_KEY] = originalManifest;
    }
  });

  delete globalThis[PUBLIC_MANIFEST_KEY];

  const manifest = createAssetManifestFromPublicManifest({
    extensions: ['.png']
  });

  assert.equal(manifest, null);
});

test('readFromAssetManifest matches direct and normalized keys', () => {
  const manifest = {
    './assets/Foo.png': '/compiled/foo.png',
    './assets/foo.png': '/compiled/foo-lower.png'
  };

  assert.equal(readFromAssetManifest(manifest, './assets/Foo.png'), '/compiled/foo.png');
  assert.equal(readFromAssetManifest(manifest, './assets/foo.png'), '/compiled/foo-lower.png');
  assert.equal(readFromAssetManifest(manifest, './assets/FOO.PNG'), '/compiled/foo-lower.png');
  assert.equal(readFromAssetManifest(manifest, ''), undefined);
});
