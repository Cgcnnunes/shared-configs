import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const registry = 'https://registry.npmjs.org';
const repository = 'Cgcnnunes/shared-configs';
const packages = ['eslint-config', 'prettier-config', 'commitlint-config'];

export function prepareRelease(directory, packageName) {
  if (!packages.includes(packageName)) {
    throw new Error(`Unknown release package: ${packageName}`);
  }

  const packagePath = `packages/${packageName}`;
  const manifest = JSON.parse(readFileSync(join(directory, packagePath, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(directory, 'package-lock.json'), 'utf8'));
  const { name, version } = manifest;

  if (
    name !== `@cgcnnunes/${packageName}` ||
    manifest.private ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version) ||
    lock.packages[packagePath]?.version !== version
  ) {
    throw new Error('Release requires a public package, stable version and matching lockfile.');
  }

  const changelog = readFileSync(join(directory, packagePath, 'CHANGELOG.md'), 'utf8');
  const sections = [...changelog.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/gmu)];
  const entries = sections.filter((section) => section[1].startsWith(`${version} (`));
  const entry = entries[0];
  const date = entry?.[1].match(/\((\d{4}-\d{2}-\d{2})\)$/u)?.[1];

  if (
    entries.length !== 1 ||
    entry[1] !== `${version} (${date})` ||
    !date ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    !entry[2].trim()
  ) {
    throw new Error(`Add a nonempty changelog entry: ## ${version} (YYYY-MM-DD)`);
  }

  return { name, notes: entry[2].trim(), packagePath, tag: `${packageName}-v${version}`, version };
}

function command(program, args, directory) {
  const result = spawnSync(program, args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 240_000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }

  return result.stdout.trim();
}

export class HttpError extends Error {
  constructor(url, response) {
    super(`GET ${url} failed: ${response.status} ${response.statusText}`);

    this.status = response.status;
  }
}

async function requestJson(url, authenticated = false) {
  const headers = authenticated
    ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` }
    : { Accept: 'application/json' };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new HttpError(url, response);
  }

  return response.json();
}

async function waitForPublication(url, request, pause) {
  const attempts = 6;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let problem = 'version is not visible yet';

    try {
      const published = await request(url);

      if (published) {
        return published;
      }
    } catch (error) {
      const transient =
        (error instanceof HttpError &&
          (error.status === 408 || error.status === 429 || error.status >= 500)) ||
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'TimeoutError');

      if (!transient || attempt === attempts) {
        throw error;
      }

      problem = error.message;
    }

    if (attempt === attempts) {
      throw new Error(`npm version is still missing after ${attempts} verification attempts.`);
    }

    console.warn(`npm verification ${attempt}/${attempts}: ${problem}; retrying in 5 seconds.`);

    await pause(5_000);
  }
}

export async function release(
  { directory = root, packageName, recover = false, retry = false, sha },
  { pause = setTimeout, request = requestJson, run = command } = {},
) {
  const prepared = prepareRelease(directory, packageName);
  const { name, notes, packagePath, tag, version } = prepared;
  const execute = (program, args) => run(program, args, directory);

  if (
    !/^[a-f\d]{40}$/u.test(sha) ||
    execute('git', ['rev-parse', 'HEAD']) !== sha ||
    execute('git', ['status', '--porcelain'])
  ) {
    throw new Error('Release must run from the exact selected commit with a clean worktree.');
  }

  const remoteTags = execute('git', [
    'ls-remote',
    '--tags',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  const tagLines = remoteTags ? remoteTags.split('\n') : [];
  const tagCommit = (tagLines.find((line) => line.endsWith('^{}')) ?? tagLines[0])?.split(
    /\s+/u,
  )[0];
  const versionUrl = `${registry}/${encodeURIComponent(name)}/${version}`;
  const releaseUrl = `https://api.github.com/repos/${repository}/releases/tags/${tag}`;
  const published = await request(versionUrl);
  const existingRelease = await request(releaseUrl, true);
  const recovering = recover || (retry && Boolean(published));

  if (tagCommit && tagCommit !== sha) {
    throw new Error(`${tag} already points to another commit; tags must never be moved.`);
  }

  if (!recovering && (published || tagCommit || existingRelease)) {
    throw new Error('Version, tag or GitHub release already exists. Review before using recovery.');
  }

  if (recover && !published) {
    throw new Error('Recovery requires an already published npm version.');
  }

  if (
    existingRelease &&
    (!tagCommit || existingRelease.draft || existingRelease.tag_name !== tag)
  ) {
    throw new Error('Existing GitHub release is inconsistent with the release tag.');
  }

  const temporary = mkdtempSync(join(tmpdir(), 'shared-configs-release-'));

  try {
    const [packed] = JSON.parse(
      execute('npm', [
        'pack',
        `./${packagePath}`,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporary,
      ]),
    );

    if (packed.name !== name || packed.version !== version || !packed.integrity) {
      throw new Error('Packed artifact does not match the selected release.');
    }

    if (!recovering) {
      execute('npm', [
        'publish',
        join(temporary, packed.filename),
        '--access',
        'public',
        '--ignore-scripts',
        '--registry',
        registry,
      ]);
    }

    const verified = recovering ? published : await waitForPublication(versionUrl, request, pause);

    if (verified?.version !== version || verified.dist?.integrity !== packed.integrity) {
      throw new Error('npm version/integrity verification failed; no tag or release was created.');
    }

    if (!tagCommit) {
      execute('git', ['tag', tag, sha]);

      execute('git', ['push', 'origin', `refs/tags/${tag}`]);
    }

    if (!existingRelease) {
      const notesPath = join(temporary, 'notes.md');

      writeFileSync(notesPath, notes);

      execute('gh', [
        'release',
        'create',
        tag,
        '--repo',
        repository,
        '--verify-tag',
        '--title',
        `${name}@${version}`,
        '--notes-file',
        notesPath,
        '--latest=false',
      ]);
    }

    console.log(`Released ${name}@${version}: ${tag}`);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_REPOSITORY !== repository ||
    !process.env.GH_TOKEN
  ) {
    throw new Error('Run this release script through the main-branch release workflow.');
  }

  await release({
    packageName: process.env.RELEASE_PACKAGE,
    recover: process.env.RELEASE_RECOVER === 'true',
    retry: process.env.RELEASE_RETRY === 'true',
    sha: process.env.GITHUB_SHA,
  });
}
