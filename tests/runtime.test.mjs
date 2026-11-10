import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('verification runs on the approved Node 24 major', () => {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24.x LTS to run verification.');
});

test('version selection, install enforcement and package metadata agree', () => {
  assert.equal(read('.nvmrc').trim(), '24');

  assert.equal(read('.npmrc').trim(), 'engine-strict=true');

  const lock = JSON.parse(read('package-lock.json'));

  for (const directory of [
    '',
    'packages/commitlint-config',
    'packages/eslint-config',
    'packages/prettier-config',
  ]) {
    const manifest = JSON.parse(read(directory ? `${directory}/package.json` : 'package.json'));

    assert.equal(manifest.engines.node, '>=24.0.0 <25.0.0');

    assert.equal(lock.packages[directory].engines.node, manifest.engines.node);
  }
});

test('validation and release select the latest patch from the same version file', () => {
  for (const workflow of ['validate', 'release']) {
    const content = read(`.github/workflows/${workflow}.yml`);

    assert.match(content, /node-version-file: \.nvmrc/u);

    assert.match(content, /check-latest: true/u);

    assert.doesNotMatch(content, /node-version:|matrix:/u);
  }
});

test('release concurrency serializes only the selected package without cancelling active runs', () => {
  const content = read('.github/workflows/release.yml');

  assert.match(content, /group: release-package-\$\{\{ inputs\.package \}\}/u);

  assert.match(content, /cancel-in-progress: false/u);
});
