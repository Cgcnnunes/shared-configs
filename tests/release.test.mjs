import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareRelease, release } from '../scripts/release.mjs';

const sha = 'a'.repeat(40);
const integrity = 'sha512-test-artifact';
const tag = 'prettier-config-v0.1.1';
const published = { dist: { integrity }, version: '0.1.1' };

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'shared-configs-release-test-'));
  const packageDirectory = join(directory, 'packages', 'prettier-config');

  mkdirSync(packageDirectory, { recursive: true });

  writeFileSync(
    join(packageDirectory, 'package.json'),
    JSON.stringify({ name: '@cgcnnunes/prettier-config', version: '0.1.1' }),
  );

  writeFileSync(
    join(directory, 'package-lock.json'),
    JSON.stringify({ packages: { 'packages/prettier-config': { version: '0.1.1' } } }),
  );

  writeFileSync(
    join(packageDirectory, 'CHANGELOG.md'),
    '# Changelog\n\n## Unreleased\n\n## 0.1.1 (2026-11-10)\n\n- Fix defaults.\n\n## 0.1.0 (2026-01-01)\n\n- Initial.\n',
  );

  t.after(() => rmSync(directory, { force: true, recursive: true }));

  return { directory, packageName: 'prettier-config', sha };
}

function harness(options = {}) {
  const calls = [];
  let uploaded = options.published ?? null;
  let temporary;
  const run = (program, args) => {
    calls.push([program, ...args]);

    const operation = `${program} ${args[0]}`;

    if (operation === options.fail) {
      throw new Error(`Failed ${operation}`);
    }

    switch (operation) {
      case 'git rev-parse':
        return options.head ?? sha;

      case 'git status':
        return options.dirty ? ' M package.json' : '';

      case 'git ls-remote':
        return (
          options.remoteTags ?? (options.tagCommit ? `${options.tagCommit}\trefs/tags/${tag}` : '')
        );

      case 'npm pack':
        temporary = args.at(-1);

        return JSON.stringify([
          {
            filename: 'package.tgz',
            integrity,
            name: '@cgcnnunes/prettier-config',
            version: '0.1.1',
          },
        ]);

      case 'npm publish':
        uploaded = options.afterPublish ?? published;

        return '';

      case 'gh release':
        assert.equal(
          readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8'),
          '- Fix defaults.',
        );

        return '';

      default:
        return '';
    }
  };
  const request = async (url) => {
    calls.push(['GET', url]);

    if (options.requestError) {
      throw new Error('Registry unavailable');
    }

    return url.startsWith('https://registry.npmjs.org')
      ? uploaded
      : (options.existingRelease ?? null);
  };

  return { calls, dependencies: { request, run }, temporary: () => temporary };
}

test('prepares only the selected package version and changelog notes', (t) => {
  const { directory, packageName } = fixture(t);

  assert.deepEqual(prepareRelease(directory, packageName), {
    name: '@cgcnnunes/prettier-config',
    notes: '- Fix defaults.',
    packagePath: 'packages/prettier-config',
    tag,
    version: '0.1.1',
  });

  assert.throws(() => prepareRelease(directory, '../eslint-config'), /Unknown release package/u);
});

test('reads dated changelog entries with CRLF line endings', (t) => {
  const { directory, packageName } = fixture(t);
  const path = join(directory, 'packages', packageName, 'CHANGELOG.md');

  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('\n', '\r\n'));

  assert.equal(prepareRelease(directory, packageName).notes, '- Fix defaults.');
});

for (const heading of [
  '0.1.1 (unreleased initial version)',
  '0.1.1 (2026-02-30)',
  '0.1.1 (2026-11-10) extra',
  '0.1.0 (2026-11-10)',
]) {
  test(`rejects unprepared changelog: ${heading}`, (t) => {
    const { directory, packageName } = fixture(t);

    writeFileSync(
      join(directory, 'packages', packageName, 'CHANGELOG.md'),
      `## ${heading}\n\n- Fix.\n`,
    );

    assert.throws(() => prepareRelease(directory, packageName), /changelog entry/u);
  });
}

test('rejects empty or duplicate version notes', (t) => {
  const { directory, packageName } = fixture(t);
  const path = join(directory, 'packages', packageName, 'CHANGELOG.md');

  for (const text of [
    '## 0.1.1 (2026-11-10)\n\n',
    '## 0.1.1 (2026-11-10)\n- One.\n## 0.1.1 (2026-11-10)\n- Two.\n',
  ]) {
    writeFileSync(path, text);

    assert.throws(() => prepareRelease(directory, packageName), /changelog entry/u);
  }
});

test('rejects mismatched lockfiles, private packages and prereleases', (t) => {
  const { directory, packageName } = fixture(t);
  const path = join(directory, 'packages', packageName, 'package.json');

  for (const changes of [{ version: '0.1.2' }, { private: true }, { version: '0.2.0-beta.1' }]) {
    writeFileSync(
      path,
      JSON.stringify({ name: '@cgcnnunes/prettier-config', version: '0.1.1', ...changes }),
    );

    assert.throws(() => prepareRelease(directory, packageName), /matching lockfile/u);
  }
});

test('publishes the packed artifact, verifies npm, then creates the tag and release', async (t) => {
  const input = fixture(t);
  const { calls, dependencies, temporary } = harness();

  await release(input, dependencies);

  const operations = calls.map(([program, operation]) => `${program} ${operation}`);

  assert.ok(operations.indexOf('npm publish') < operations.indexOf('git tag'));

  assert.ok(operations.indexOf('git push') < operations.indexOf('gh release'));

  assert.equal(calls.filter(([program]) => program === 'GET').length, 3);

  assert.deepEqual(
    calls.find(([program, operation]) => program === 'git' && operation === 'tag'),
    ['git', 'tag', tag, sha],
  );

  assert.ok(
    calls
      .find(([program, operation]) => program === 'npm' && operation === 'publish')
      .includes('--provenance'),
  );

  assert.equal(existsSync(temporary()), false);
});

for (const options of [
  { dirty: true },
  { head: 'b'.repeat(40) },
  { published },
  { tagCommit: sha },
  { tagCommit: 'b'.repeat(40) },
  { existingRelease: { tag_name: tag } },
  { requestError: true },
]) {
  test(`preflight blocks unsafe releases: ${JSON.stringify(options)}`, async (t) => {
    const input = fixture(t);
    const { calls, dependencies } = harness(options);

    await assert.rejects(release(input, dependencies));

    assert.equal(
      calls.some(([program]) => ['npm', 'gh'].includes(program)),
      false,
    );

    assert.equal(
      calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );
  });
}

for (const options of [
  { fail: 'npm publish' },
  { afterPublish: { dist: { integrity: 'different' }, version: '0.1.1' } },
  { afterPublish: { dist: { integrity }, version: '0.1.2' } },
]) {
  test(`publication failure cannot create a tag: ${JSON.stringify(options)}`, async (t) => {
    const input = fixture(t);
    const { calls, dependencies, temporary } = harness(options);

    await assert.rejects(release(input, dependencies));

    assert.equal(
      calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );

    assert.equal(existsSync(temporary()), false);
  });
}

test('tag push failure does not announce a GitHub release', async (t) => {
  const input = fixture(t);
  const { calls, dependencies } = harness({ fail: 'git push' });

  await assert.rejects(release(input, dependencies), /git push/u);

  assert.equal(
    calls.some(([program]) => program === 'gh'),
    false,
  );
});

test('GitHub release creation failure can be recovered without republishing', async (t) => {
  const input = fixture(t);
  const failed = harness({ fail: 'gh release' });

  await assert.rejects(release(input, failed.dependencies), /gh release/u);

  const retry = harness({ published, tagCommit: sha });

  await release({ ...input, recover: true }, retry.dependencies);

  assert.equal(
    retry.calls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
    false,
  );
});

test('recovery compares the peeled commit of annotated tags', async (t) => {
  const input = { ...fixture(t), recover: true };
  const { calls, dependencies } = harness({
    published,
    remoteTags: `${'b'.repeat(40)}\trefs/tags/${tag}\n${sha}\trefs/tags/${tag}^{}`,
  });

  await release(input, dependencies);

  assert.equal(
    calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
    false,
  );
});

for (const tagCommit of [undefined, sha]) {
  test(`recovery completes missing metadata without republishing (tag: ${tagCommit})`, async (t) => {
    const input = { ...fixture(t), recover: true };
    const { calls, dependencies } = harness({ published, tagCommit });

    await release(input, dependencies);

    assert.equal(
      calls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
      false,
    );

    assert.equal(
      calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      !tagCommit,
    );

    assert.equal(
      calls.some(([program]) => program === 'gh'),
      true,
    );
  });
}

test('completed recovery is idempotent', async (t) => {
  const input = { ...fixture(t), recover: true };
  const { calls, dependencies } = harness({
    existingRelease: { draft: false, tag_name: tag },
    published,
    tagCommit: sha,
  });

  await release(input, dependencies);

  assert.equal(
    calls.some(([program]) => program === 'gh'),
    false,
  );

  assert.equal(
    calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
    false,
  );
});

for (const options of [
  {},
  { published: { dist: { integrity: 'wrong' }, version: '0.1.1' } },
  { published, tagCommit: 'b'.repeat(40) },
  { existingRelease: { tag_name: tag }, published },
  { existingRelease: { draft: true, tag_name: tag }, published, tagCommit: sha },
]) {
  test(`recovery refuses inconsistent state: ${JSON.stringify(options)}`, async (t) => {
    const input = { ...fixture(t), recover: true };
    const { calls, dependencies } = harness(options);

    await assert.rejects(release(input, dependencies));

    assert.equal(
      calls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
      false,
    );

    assert.equal(
      calls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );

    assert.equal(
      calls.some(([program]) => program === 'gh'),
      false,
    );
  });
}
