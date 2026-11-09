import { createCommitlintConfig } from '@cgcnnunes/commitlint-config';
import lint from '@commitlint/lint';
import load from '@commitlint/load';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import repositoryConfig from '../commitlint.config.mjs';

async function check(message, appName = 'reader') {
  const config = await load(createCommitlintConfig({ appName }));

  return lint(message, config.rules, {
    defaultIgnores: config.defaultIgnores,
    plugins: config.plugins,
  });
}

test('repository config requires config scopes without changing consumer prefixes', async () => {
  const config = await load(repositoryConfig);
  const options = { defaultIgnores: config.defaultIgnores, plugins: config.plugins };

  assert.equal((await lint('fix(config-00003): update scopes', config.rules, options)).valid, true);

  for (const scope of ['shared-configs-00003', 'reader-00003', 'config-0003', 'config-00000']) {
    assert.equal(
      (await lint(`fix(${scope}): update scopes`, config.rules, options)).valid,
      false,
      scope,
    );
  }

  assert.equal((await check('fix(reader-00003): update scopes')).valid, true);

  assert.equal((await check('fix(my-app-00003): update scopes', 'my-app')).valid, true);
});

test('allows every supported type, bodies, footers and both ID boundaries', async () => {
  for (const type of ['feat', 'chore', 'refactor', 'fix', 'doc']) {
    assert.equal((await check(`${type}(reader-00001): add settings`)).valid, true);
  }

  assert.equal((await check('fix(reader-99999): handle failure')).valid, true);

  assert.equal(
    (await check('feat(reader-00002): add settings\n\nDetails.\n\nBREAKING CHANGE: new settings'))
      .valid,
    true,
  );
});

test('uses the consuming app name, including a hyphenated slug', async () => {
  assert.equal((await check('feat(my-app-00042): add settings', 'my-app')).valid, true);

  assert.equal((await check('feat(reader-00042): add settings', 'my-app')).valid, false);

  assert.equal((await check('fix(shop2-00001): add settings', 'shop2')).valid, true);
});

test('rejects invalid app names instead of creating permissive rules', () => {
  for (const appName of ['', 'Reader', 'my_app', 'reader.*', 'a--b', '-app', 'app-', '2app']) {
    assert.throws(() => createCommitlintConfig({ appName }), TypeError);
  }

  assert.throws(() => createCommitlintConfig(), TypeError);
});

test('rejects malformed or exempt-looking subjects', async () => {
  for (const message of [
    'docs(reader-00001): add settings',
    'test(reader-00001): add settings',
    'feat(other-00001): add settings',
    'feat(reader-00000): add settings',
    'feat(reader-0001): add settings',
    'feat(reader-000001): add settings',
    'feat(reader-abcde): add settings',
    'feat: add settings',
    'feat(reader-00001)!: add settings',
    'feat(reader-00001): Add settings',
    'feat(reader-00001):  add settings',
    'feat(reader-00001): ',
    'feat(reader-00001): add settings)',
    'Merge branch main',
    'Revert "feat(reader-00001): add settings"',
    'fixup! feat(reader-00001): add settings',
  ]) {
    assert.equal((await check(message)).valid, false, JSON.stringify(message));
  }
});

test('documents Commitlint skipping an empty message before custom rules run', async () => {
  assert.equal((await check('')).valid, true);
});

test('enforces the exact 120-character subject boundary, not the body length', async () => {
  const prefix = 'feat(reader-00001): ';

  const subject = prefix + 'a'.repeat(120 - prefix.length);

  assert.equal(subject.length, 120);

  assert.equal((await check(subject)).valid, true);

  assert.equal((await check(`${subject}\n\n${'body '.repeat(100)}`)).valid, true);

  assert.equal((await check(`${subject}a`)).valid, false);
});

test('allows composing app-local history rules without losing shared validation', async () => {
  const shared = createCommitlintConfig({ appName: 'reader' });

  const config = await load({
    ...shared,
    plugins: [
      {
        rules: {
          ...shared.plugins[0].rules,
          'local-sequence': () => [false, 'Expected the next local number.'],
        },
      },
    ],
    rules: { ...shared.rules, 'local-sequence': [2, 'always'] },
  });

  const result = await lint('feat(reader-00001): add settings', config.rules, {
    defaultIgnores: config.defaultIgnores,
    plugins: config.plugins,
  });

  assert.equal(result.valid, false);

  assert.deepEqual(
    result.errors.map((error) => error.name),
    ['local-sequence'],
  );

  const invalid = await lint('feat(other-00001): add settings', config.rules, {
    defaultIgnores: config.defaultIgnores,
    plugins: config.plugins,
  });

  assert.deepEqual(
    invalid.errors.map((error) => error.name),
    ['app-subject', 'local-sequence'],
  );
});
