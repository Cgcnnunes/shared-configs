import { load } from 'js-yaml';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const workflow = (name) => load(read(`.github/workflows/${name}.yml`));

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
  for (const name of ['validate', 'release']) {
    const job = workflow(name).jobs[name];
    const setup = job.steps.filter((step) => step.uses?.startsWith('actions/setup-node@'));

    assert.equal(setup.length, 1);

    assert.equal(setup[0].with['node-version-file'], '.nvmrc');

    assert.equal(setup[0].with['check-latest'], true);

    assert.equal(setup[0].with['node-version'], undefined);

    assert.equal(job.strategy?.matrix, undefined);
  }
});

test('release concurrency serializes only the selected package without cancelling active runs', () => {
  assert.deepEqual(workflow('release').concurrency, {
    'cancel-in-progress': false,
    group: 'release-package-${{ inputs.package }}',
    queue: 'max',
  });
});

test('workflows cache npm downloads by lockfile without skipping clean installs', () => {
  for (const name of ['validate', 'release']) {
    const { steps } = workflow(name).jobs[name];
    const setup = steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
    const install = steps.filter((step) => step.run?.startsWith('npm ci'));

    assert.equal(setup.with.cache, 'npm');

    assert.equal(setup.with['cache-dependency-path'], 'package-lock.json');

    assert.equal(install.length, 1);

    assert.equal(install[0].run, 'npm ci --prefer-offline --no-audit --no-fund');

    assert.equal(install[0].if, undefined);
  }
});

test('release keeps explicit recovery separate from automatic retry detection', () => {
  const job = workflow('release').jobs.release;
  const publish = job.steps.find((step) => step.run === 'node scripts/release.mjs');
  const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));

  assert.equal(publish.env.RELEASE_RECOVER, '${{ inputs.recover }}');

  assert.equal(publish.env.RELEASE_RETRY, '${{ github.run_attempt > 1 }}');

  assert.equal(checkout.with.ref, '${{ github.sha }}');

  assert.equal(checkout.with['fetch-depth'], undefined);
});

test('PR policy checks include title edits and have commit history available', () => {
  const validation = workflow('validate');
  const { steps } = validation.jobs.validate;
  const policy = steps.find((step) => step.run === 'node scripts/validate-pr.mjs');
  const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));

  assert.deepEqual(validation.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'edited',
  ]);

  assert.equal(policy.if, "github.event_name == 'pull_request'");

  assert.equal(checkout.with['fetch-depth'], 0);
});
