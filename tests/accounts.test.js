import test from 'node:test';
import assert from 'node:assert/strict';

import {
  callSignLength,
  generateCallSignCandidate,
  maxAccountExp,
  maxAccountLevel,
  normalizeAccountExp,
  normalizeAccountLevel,
  sanitizeLobbyLayoutSnapshot
} from '../src/services/accounts.js';

test('sanitizeLobbyLayoutSnapshot filters and rounds lobby coordinates', () => {
  const snapshot = {
    interactables: {
      beta: { x: 10.4, y: 20.6, unused: true },
      alpha: { x: 5.2, y: 'oops' },
      empty: null,
      delta: { x: 'nope', y: 'also nope' }
    },
    platforms: {
      '02': { x: 15.9, y: 7.1 },
      '01': { x: 'invalid', y: 4.2 }
    },
    portal: { x: 100.9, y: 'invalid' }
  };

  const sanitised = sanitizeLobbyLayoutSnapshot(snapshot);

  assert.deepEqual(sanitised, {
    interactables: {
      alpha: { x: 5 },
      beta: { x: 10, y: 21 }
    },
    platforms: {
      '01': { y: 4 },
      '02': { x: 16, y: 7 }
    },
    portal: { x: 101 }
  });
});

test('sanitizeLobbyLayoutSnapshot returns null when nothing is salvageable', () => {
  const sanitised = sanitizeLobbyLayoutSnapshot({
    interactables: {
      invalid: { x: 'nope', y: null }
    }
  });

  assert.equal(sanitised, null);
});

test('normalizeAccountLevel clamps values to the supported range', () => {
  assert.equal(normalizeAccountLevel(5.8), 5);
  assert.equal(normalizeAccountLevel(-4), 1);
  assert.equal(normalizeAccountLevel(Number.NaN), 1);
  assert.equal(normalizeAccountLevel(maxAccountLevel + 50), maxAccountLevel);
});

test('normalizeAccountExp clamps values to the supported range', () => {
  assert.equal(normalizeAccountExp(1234.7), 1234);
  assert.equal(normalizeAccountExp(-10), 0);
  assert.equal(normalizeAccountExp(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeAccountExp(maxAccountExp + 10), maxAccountExp);
});

test('generateCallSignCandidate returns trimmed preferred values when valid', () => {
  const preferred = ' 12345 ';
  const candidate = generateCallSignCandidate(preferred);
  assert.equal(candidate, '12345');
});

test('generateCallSignCandidate avoids existing registry entries', (t) => {
  const registryValues = ['10000'];
  const storage = {
    getItem: (key) => {
      if (key === 'astrocat-call-signs') {
        return JSON.stringify(registryValues);
      }
      return null;
    },
    setItem: () => {}
  };

  const sequence = [0, 0.5];
  const originalRandom = Math.random;
  let callCount = 0;

  Math.random = () => {
    callCount += 1;
    if (sequence.length > 0) {
      return sequence.shift();
    }
    return 0.12345;
  };

  t.after(() => {
    Math.random = originalRandom;
  });

  const candidate = generateCallSignCandidate('not-valid', {
    getLocalStorage: () => storage
  });

  assert.equal(candidate.length, callSignLength);
  assert.notEqual(candidate, '10000');
  assert.ok(callCount >= 2, 'expected to retry when registry is populated');
});
