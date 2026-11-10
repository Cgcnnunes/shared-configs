import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validatePackageReleases, validatePullRequest } from '../scripts/validate-pr.mjs';

const packageNames = ['eslint-config', 'prettier-config', 'commitlint-config'];
const template = readFileSync(
  new URL('../.github/pull_request_template.md', import.meta.url),
  'utf8',
);

function releaseFixture(selections = {}) {
  const body = packageNames.reduce(
    (text, name) =>
      text.replace(
        `- [ ] @cgcnnunes/${name}: ${selections[name] ?? 'No release'}`,
        `- [x] @cgcnnunes/${name}: ${selections[name] ?? 'No release'}`,
      ),
    template,
  );
  const packages = Object.fromEntries(
    packageNames.map((name) => [
      name,
      {
        baseChangelog: '## 1.2.3 (2026-11-01)\n\n- Previous release.\n',
        baseVersion: '1.2.3',
        changelog: '## Unreleased\n',
        lockVersion: '1.2.3',
        version: '1.2.3',
      },
    ]),
  );

  return { body, packages };
}

test('repository-only PRs select No release for every package', () => {
  assert.doesNotThrow(() => validatePackageReleases(releaseFixture()));
});

for (const name of packageNames) {
  for (const [type, version] of [
    ['Major', '2.0.0'],
    ['Minor', '1.3.0'],
    ['Patch', '1.2.4'],
  ]) {
    test(`${name} ${type} validates independent manifest/lockfile and changelog versions`, () => {
      const input = releaseFixture({ [name]: type });

      Object.assign(input.packages[name], {
        changelog: `## ${version} (2026-11-10)\n\n- Release notes.\n`,
        lockVersion: version,
        version,
      });

      assert.doesNotThrow(() => validatePackageReleases(input));
    });
  }
}

test('initial release keeps 0.1.0 while requiring prepared notes', () => {
  const input = releaseFixture({ 'eslint-config': 'Initial release' });

  Object.assign(input.packages['eslint-config'], {
    baseChangelog: '## 0.1.0 (unreleased initial version)\n\n- Initial.\n',
    baseVersion: '0.1.0',
    changelog: '## 0.1.0 (2026-11-10)\n\n- Initial.\n',
    lockVersion: '0.1.0',
    version: '0.1.0',
  });

  assert.doesNotThrow(() => validatePackageReleases(input));

  input.packages['eslint-config'].baseChangelog = '## 0.1.0 (2026-11-01)\n\n- Released.\n';

  assert.throws(() => validatePackageReleases(input), /Initial release is only/u);
});

test('initial release cannot bypass bump requirements for other versions', () => {
  assert.throws(
    () => validatePackageReleases(releaseFixture({ 'eslint-config': 'Initial release' })),
    /Initial release is only/u,
  );
});

test('every package needs exactly one selection, including unaffected packages', () => {
  const input = releaseFixture();

  assert.throws(() => validatePackageReleases({ ...input, body: template }), /exactly one/u);

  assert.throws(
    () =>
      validatePackageReleases({
        ...input,
        body: `${input.body}\n- [x] @cgcnnunes/eslint-config: Patch\n`,
      }),
    /exactly one/u,
  );

  assert.throws(
    () =>
      validatePackageReleases({
        ...input,
        body: `${input.body}\n- [x] @cgcnnunes/eslint-config: No release\n`,
      }),
    /exactly one/u,
  );
});

test('comments and fenced examples cannot count as checked selections', () => {
  const input = releaseFixture();
  const selections = packageNames.map((name) => `- [x] @cgcnnunes/${name}: No release`).join('\n');

  for (const body of [`<!--\n${selections}\n-->`, `\`\`\`markdown\n${selections}\n\`\`\``]) {
    assert.throws(() => validatePackageReleases({ ...input, body }), /exactly one/u);
  }
});

test('unknown checked packages or release types fail clearly', () => {
  const input = releaseFixture();

  for (const selection of ['other-config: Patch', 'eslint-config: Feature']) {
    assert.throws(
      () =>
        validatePackageReleases({
          ...input,
          body: `${input.body}\n- [x] @cgcnnunes/${selection}\n`,
        }),
      /Unknown package release selection/u,
    );
  }
});

test('uppercase checkmarks and CRLF PR bodies are accepted', () => {
  const input = releaseFixture();

  input.body = input.body.replaceAll('[x]', '[X]').replaceAll('\n', '\r\n');

  assert.doesNotThrow(() => validatePackageReleases(input));
});

for (const [type, version] of [
  ['Major', '2.2.3'],
  ['Minor', '1.3.3'],
  ['Patch', '1.2.5'],
  ['No release', '1.2.4'],
]) {
  test(`${type} rejects incorrect version ${version}`, () => {
    const input = releaseFixture({ 'eslint-config': type });

    Object.assign(input.packages['eslint-config'], { lockVersion: version, version });

    assert.throws(() => validatePackageReleases(input), /requires/u);
  });
}

test('selected releases require valid dated nonempty notes', () => {
  const input = releaseFixture({ 'eslint-config': 'Patch' });

  Object.assign(input.packages['eslint-config'], { lockVersion: '1.2.4', version: '1.2.4' });

  for (const changelog of [
    '## Unreleased\n\n- Fix.\n',
    '## 1.2.4 (2026-11-10)\n\n',
    '## 1.2.4 (2026-02-30)\n\n- Fix.\n',
  ]) {
    input.packages['eslint-config'].changelog = changelog;

    assert.throws(() => validatePackageReleases(input), /changelog entry/u);
  }
});

test('lockfile mismatches and unstable versions fail validation', () => {
  for (const changes of [
    { lockVersion: '1.2.4' },
    { version: '1.2.4-beta.1' },
    { baseVersion: 'v1.2.3' },
  ]) {
    const input = releaseFixture();

    Object.assign(input.packages['eslint-config'], changes);

    assert.throws(() => validatePackageReleases(input), /stable manifest/u);
  }
});

test('one branch ID is shared by the PR title and every commit', async () => {
  await validatePullRequest({
    branch: 'config-00008',
    subjects: [
      'feat(config-00008): add policy validation',
      'fix(config-00008): handle invalid titles',
    ],
    title: 'feat(config-00008): enforce branch identification',
  });
});

for (const branch of [
  'shared-configs-00002',
  'feat/independent-package-releases',
  'configs-00008',
  'config-00000',
  'config-0008',
  'config-000008',
]) {
  test(`rejects invalid PR branch ${branch}`, async () => {
    await assert.rejects(
      validatePullRequest({ branch, subjects: [], title: 'feat(config-00008): add policy' }),
      /PR branches/u,
    );
  });
}

for (const subject of [
  '',
  'feat(config-00009): add policy',
  'feat(config-00008): Add policy',
  'ci(config-00008): add policy',
  'feat(config-00008): add policy)',
]) {
  test(`rejects invalid or mismatched title and commit: ${subject}`, async () => {
    await assert.rejects(
      validatePullRequest({ branch: 'config-00008', subjects: [], title: subject }),
      /PR title/u,
    );

    await assert.rejects(
      validatePullRequest({
        branch: 'config-00008',
        subjects: ['feat(config-00008): add policy', subject],
        title: 'feat(config-00008): add policy',
      }),
      /Commit 2/u,
    );
  });
}
