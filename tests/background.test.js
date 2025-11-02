import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPageBackgroundFromUrl,
  createAssetManifestFromPublicManifest,
  readFromAssetManifest,
  resolvePublicAssetCandidatesByBasename
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

test('resolvePublicAssetCandidatesByBasename normalizes manifest relative paths', (t) => {
  const originalManifest = globalThis[PUBLIC_MANIFEST_KEY];
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  t.after(() => {
    if (originalManifest === undefined) {
      delete globalThis[PUBLIC_MANIFEST_KEY];
    } else {
      globalThis[PUBLIC_MANIFEST_KEY] = originalManifest;
    }

    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  globalThis.document = { baseURI: 'https://example.test/app/index.html' };
  globalThis.window = { location: { href: 'https://example.test/app/index.html' } };

  globalThis[PUBLIC_MANIFEST_KEY] = {
    'webpagebackground.png': './webpagebackground.png'
  };

  const candidates = resolvePublicAssetCandidatesByBasename('webpagebackground');
  assert.equal(Array.isArray(candidates), true);
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0], 'https://example.test/app/webpagebackground.png');
});

test('applyPageBackgroundFromUrl resolves relative URLs before applying styles', (t) => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  t.after(() => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  globalThis.document = { baseURI: 'https://example.test/app/index.html' };
  globalThis.window = { location: { href: 'https://example.test/app/index.html' } };

  const createElementStub = () => {
    const classes = new Set();
    const styles = new Map();
    return {
      classList: {
        add: (...tokens) => tokens.forEach((token) => classes.add(token)),
        remove: (...tokens) => tokens.forEach((token) => classes.delete(token))
      },
      style: {
        setProperty: (name, value) => styles.set(name, value),
        removeProperty: (name) => styles.delete(name)
      },
      __classes: classes,
      __styles: styles
    };
  };

  const rootElement = createElementStub();
  const bodyElement = createElementStub();
  bodyElement.ownerDocument = { documentElement: rootElement };

  applyPageBackgroundFromUrl(bodyElement, './webpagebackground.png');

  assert.equal(rootElement.__classes.has('has-custom-background'), true);
  assert.equal(
    rootElement.__styles.get('--page-background-overlay'),
    'url("https://example.test/app/webpagebackground.png")'
  );
});
