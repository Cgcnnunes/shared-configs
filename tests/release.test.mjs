import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HttpError, prepareRelease, release } from '../scripts/release.mjs';

const mockSha = 'a'.repeat(40);
const mockIntegrity = 'sha512-test-artifact';
const mockTag = 'prettier-config-v0.1.1';
const mockPublished = { dist: { integrity: mockIntegrity }, version: '0.1.1' };

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

  return { directory, packageName: 'prettier-config', sha: mockSha };
}

function mockReleaseDependencies(mockOptions = {}) {
  const spyCalls = [];
  const mockResponses = [...(mockOptions.verificationResponses ?? [])];
  let mockUploaded = mockOptions.published ?? null;
  let mockDidPublish = false;
  let temporary;
  const mockRun = (program, args) => {
    spyCalls.push([program, ...args]);

    const operation = `${program} ${args[0]}`;

    if (operation === mockOptions.fail) {
      throw new Error(`Failed ${operation}`);
    }

    switch (operation) {
      case 'git rev-parse':
        return mockOptions.head ?? mockSha;

      case 'git status':
        return mockOptions.dirty ? ' M package.json' : '';

      case 'git ls-remote':
        return (
          mockOptions.remoteTags ??
          (mockOptions.tagCommit ? `${mockOptions.tagCommit}\trefs/tags/${mockTag}` : '')
        );

      case 'npm pack':
        temporary = args.at(-1);

        return JSON.stringify([
          {
            filename: 'package.tgz',
            integrity: mockIntegrity,
            name: '@cgcnnunes/prettier-config',
            version: '0.1.1',
          },
        ]);

      case 'npm publish':
        mockDidPublish = true;

        mockUploaded = mockOptions.afterPublish ?? mockPublished;

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
  const mockRequest = async (url) => {
    spyCalls.push(['GET', url]);

    if (mockOptions.requestError) {
      throw new Error('Registry unavailable');
    }

    if (mockDidPublish && url.startsWith('https://registry.npmjs.org') && mockResponses.length) {
      const mockResponse = mockResponses.shift();

      if (mockResponse instanceof Error) {
        throw mockResponse;
      }

      return mockResponse;
    }

    return url.startsWith('https://registry.npmjs.org')
      ? mockUploaded
      : (mockOptions.existingRelease ?? null);
  };

  const mockPause = async (milliseconds) => {
    spyCalls.push(['pause', milliseconds]);
  };

  return {
    mockDependencies: { pause: mockPause, request: mockRequest, run: mockRun },
    spyCalls,
    temporary: () => temporary,
  };
}

test('prepares only the selected package version and changelog notes', (t) => {
  const { directory, packageName } = fixture(t);

  assert.deepEqual(prepareRelease(directory, packageName), {
    name: '@cgcnnunes/prettier-config',
    notes: '- Fix defaults.',
    packagePath: 'packages/prettier-config',
    tag: mockTag,
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
  const { mockDependencies, spyCalls, temporary } = mockReleaseDependencies();

  await release(input, mockDependencies);

  const operations = spyCalls.map(([program, operation]) => `${program} ${operation}`);

  assert.ok(operations.indexOf('npm publish') < operations.indexOf('git tag'));

  assert.ok(operations.indexOf('git push') < operations.indexOf('gh release'));

  assert.equal(spyCalls.filter(([program]) => program === 'GET').length, 3);

  assert.deepEqual(
    spyCalls.find(([program, operation]) => program === 'git' && operation === 'tag'),
    ['git', 'tag', mockTag, mockSha],
  );

  assert.equal(existsSync(temporary()), false);
});

for (const mockResponse of [
  null,
  new HttpError('npm', { status: 408, statusText: 'Request Timeout' }),
  new HttpError('npm', { status: 429, statusText: 'Too Many Requests' }),
  new HttpError('npm', { status: 503, statusText: 'Service Unavailable' }),
  new TypeError('fetch failed'),
  new DOMException('Request timed out', 'TimeoutError'),
]) {
  test(`publication verification retries transient responses: ${mockResponse}`, async (t) => {
    const input = fixture(t);
    const { mockDependencies, spyCalls } = mockReleaseDependencies({
      verificationResponses: [mockResponse, mockPublished],
    });

    await release(input, mockDependencies);

    assert.deepEqual(
      spyCalls.filter(([program]) => program === 'pause'),
      [['pause', 5_000]],
    );

    assert.equal(
      spyCalls.filter(([program, operation]) => program === 'npm' && operation === 'publish')
        .length,
      1,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      true,
    );
  });
}

for (const mockResponse of [
  null,
  new HttpError('npm', { status: 503, statusText: 'Service Unavailable' }),
]) {
  test(`publication verification stops after six attempts: ${mockResponse}`, async (t) => {
    const input = fixture(t);
    const { mockDependencies, spyCalls, temporary } = mockReleaseDependencies({
      verificationResponses: Array(6).fill(mockResponse),
    });

    await assert.rejects(release(input, mockDependencies));

    assert.equal(spyCalls.filter(([program]) => program === 'GET').length, 8);

    assert.equal(spyCalls.filter(([program]) => program === 'pause').length, 5);

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );

    assert.equal(existsSync(temporary()), false);
  });
}

for (const mockResponse of [
  new HttpError('npm', { status: 401, statusText: 'Unauthorized' }),
  new HttpError('npm', { status: 403, statusText: 'Forbidden' }),
  new SyntaxError('Invalid registry JSON'),
  { dist: { integrity: 'wrong' }, version: '0.1.1' },
  { dist: { integrity: mockIntegrity }, version: '0.1.2' },
]) {
  test(`publication verification fails immediately on nontransient errors: ${mockResponse}`, async (t) => {
    const input = fixture(t);
    const { mockDependencies, spyCalls } = mockReleaseDependencies({
      verificationResponses: [mockResponse, mockPublished],
    });

    await assert.rejects(release(input, mockDependencies));

    assert.equal(
      spyCalls.some(([program]) => program === 'pause'),
      false,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );
  });
}

test('reruns publish normally when the original attempt never published', async (t) => {
  const input = { ...fixture(t), retry: true };
  const { mockDependencies, spyCalls } = mockReleaseDependencies();

  await release(input, mockDependencies);

  assert.equal(
    spyCalls.filter(([program, operation]) => program === 'npm' && operation === 'publish').length,
    1,
  );
});

test('reruns recover existing publications without republishing', async (t) => {
  const input = { ...fixture(t), retry: true };
  const { mockDependencies, spyCalls } = mockReleaseDependencies({ published: mockPublished });

  await release(input, mockDependencies);

  assert.equal(
    spyCalls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
    false,
  );

  assert.equal(
    spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
    true,
  );
});

test('automatic reruns retain integrity and tag-conflict safeguards', async (t) => {
  const input = { ...fixture(t), retry: true };

  for (const mockOptions of [
    { published: { dist: { integrity: 'wrong' }, version: '0.1.1' } },
    { published: mockPublished, tagCommit: 'b'.repeat(40) },
    { tagCommit: mockSha },
  ]) {
    const { mockDependencies, spyCalls } = mockReleaseDependencies(mockOptions);

    await assert.rejects(release(input, mockDependencies));

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
      false,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );
  }
});

test('explicit recovery never publishes even on a rerun with no npm version', async (t) => {
  const input = { ...fixture(t), recover: true, retry: true };
  const { mockDependencies, spyCalls } = mockReleaseDependencies();

  await assert.rejects(release(input, mockDependencies), /already published/u);

  assert.equal(
    spyCalls.some(([program]) => program === 'npm'),
    false,
  );
});

for (const mockOptions of [
  { dirty: true },
  { head: 'b'.repeat(40) },
  { published: mockPublished },
  { tagCommit: mockSha },
  { tagCommit: 'b'.repeat(40) },
  { existingRelease: { tag_name: mockTag } },
  { requestError: true },
]) {
  test(`preflight blocks unsafe releases: ${JSON.stringify(mockOptions)}`, async (t) => {
    const input = fixture(t);
    const { mockDependencies, spyCalls } = mockReleaseDependencies(mockOptions);

    await assert.rejects(release(input, mockDependencies));

    assert.equal(
      spyCalls.some(([program]) => ['npm', 'gh'].includes(program)),
      false,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );
  });
}

for (const mockOptions of [
  { fail: 'npm publish' },
  { afterPublish: { dist: { integrity: 'different' }, version: '0.1.1' } },
  { afterPublish: { dist: { integrity: mockIntegrity }, version: '0.1.2' } },
]) {
  test(`publication failure cannot create a tag: ${JSON.stringify(mockOptions)}`, async (t) => {
    const input = fixture(t);
    const { mockDependencies, spyCalls, temporary } = mockReleaseDependencies(mockOptions);

    await assert.rejects(release(input, mockDependencies));

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );

    assert.equal(existsSync(temporary()), false);
  });
}

test('tag push failure does not announce a GitHub release', async (t) => {
  const input = fixture(t);
  const { mockDependencies, spyCalls } = mockReleaseDependencies({ fail: 'git push' });

  await assert.rejects(release(input, mockDependencies), /git push/u);

  assert.equal(
    spyCalls.some(([program]) => program === 'gh'),
    false,
  );
});

test('GitHub release creation failure can be recovered without republishing', async (t) => {
  const input = fixture(t);
  const mockFailedRelease = mockReleaseDependencies({ fail: 'gh release' });

  await assert.rejects(release(input, mockFailedRelease.mockDependencies), /gh release/u);

  const mockRetryRelease = mockReleaseDependencies({
    published: mockPublished,
    tagCommit: mockSha,
  });

  await release({ ...input, recover: true }, mockRetryRelease.mockDependencies);

  assert.equal(
    mockRetryRelease.spyCalls.some(
      ([program, operation]) => program === 'npm' && operation === 'publish',
    ),
    false,
  );
});

test('recovery compares the peeled commit of annotated tags', async (t) => {
  const input = { ...fixture(t), recover: true };
  const { mockDependencies, spyCalls } = mockReleaseDependencies({
    published: mockPublished,
    remoteTags: `${'b'.repeat(40)}\trefs/tags/${mockTag}\n${mockSha}\trefs/tags/${mockTag}^{}`,
  });

  await release(input, mockDependencies);

  assert.equal(
    spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
    false,
  );
});

for (const mockTagCommit of [undefined, mockSha]) {
  test(`recovery completes missing metadata without republishing (tag: ${mockTagCommit})`, async (t) => {
    const input = { ...fixture(t), recover: true };
    const { mockDependencies, spyCalls } = mockReleaseDependencies({
      published: mockPublished,
      tagCommit: mockTagCommit,
    });

    await release(input, mockDependencies);

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
      false,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      !mockTagCommit,
    );

    assert.equal(
      spyCalls.some(([program]) => program === 'gh'),
      true,
    );
  });
}

test('completed recovery is idempotent', async (t) => {
  const input = { ...fixture(t), recover: true };
  const { mockDependencies, spyCalls } = mockReleaseDependencies({
    existingRelease: { draft: false, tag_name: mockTag },
    published: mockPublished,
    tagCommit: mockSha,
  });

  await release(input, mockDependencies);

  assert.equal(
    spyCalls.some(([program]) => program === 'gh'),
    false,
  );

  assert.equal(
    spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
    false,
  );
});

for (const mockOptions of [
  {},
  { published: { dist: { integrity: 'wrong' }, version: '0.1.1' } },
  { published: mockPublished, tagCommit: 'b'.repeat(40) },
  { existingRelease: { tag_name: mockTag }, published: mockPublished },
  {
    existingRelease: { draft: true, tag_name: mockTag },
    published: mockPublished,
    tagCommit: mockSha,
  },
]) {
  test(`recovery refuses inconsistent state: ${JSON.stringify(mockOptions)}`, async (t) => {
    const input = { ...fixture(t), recover: true };
    const { mockDependencies, spyCalls } = mockReleaseDependencies(mockOptions);

    await assert.rejects(release(input, mockDependencies));

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'npm' && operation === 'publish'),
      false,
    );

    assert.equal(
      spyCalls.some(([program, operation]) => program === 'git' && operation === 'tag'),
      false,
    );

    assert.equal(
      spyCalls.some(([program]) => program === 'gh'),
      false,
    );
  });
}
