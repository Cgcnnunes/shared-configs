import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import repositoryConfig from '../commitlint.config.mjs';
import { releaseNotes } from './release.mjs';

const packageNames = ['eslint-config', 'prettier-config', 'commitlint-config'];
const releaseTypes = ['Major', 'Minor', 'Patch', 'Initial release', 'No release'];

export function validatePackageReleases({ body, packages }) {
  const selections = new Map(packageNames.map((name) => [name, []]));
  const visibleBody = body.replace(/<!--[\s\S]*?-->/gu, '').replace(/```[\s\S]*?```/gu, '');

  for (const match of visibleBody.matchAll(
    /^- \[[xX]\] @cgcnnunes\/([^:\r\n]+): ([^\r\n]+)\r?$/gmu,
  )) {
    const [, name, type] = match;

    if (!selections.has(name) || !releaseTypes.includes(type.trim())) {
      throw new Error(`Unknown package release selection: ${name}: ${type}`);
    }

    selections.get(name).push(type.trim());
  }

  for (const name of packageNames) {
    const selected = selections.get(name);

    if (selected.length !== 1) {
      throw new Error(`Select exactly one release type for @cgcnnunes/${name}.`);
    }

    const { baseChangelog, baseVersion, changelog, lockVersion, version } = packages[name];
    const type = selected[0];
    const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

    if (
      !stableVersion.test(baseVersion) ||
      !stableVersion.test(version) ||
      lockVersion !== version
    ) {
      throw new Error(`${name}: stable manifest versions and a matching lockfile are required.`);
    }

    let expected = baseVersion;

    if (['Major', 'Minor', 'Patch'].includes(type)) {
      const [major, minor, patch] = baseVersion.split('.').map(BigInt);

      expected =
        type === 'Major'
          ? `${major + 1n}.0.0`
          : type === 'Minor'
            ? `${major}.${minor + 1n}.0`
            : `${major}.${minor}.${patch + 1n}`;
    }

    if (version !== expected) {
      throw new Error(`${name}: ${type} requires ${expected}, found ${version}.`);
    }

    if (
      type === 'Initial release' &&
      (baseVersion !== '0.1.0' ||
        !/^## 0\.1\.0 \(unreleased initial version\)\r?$/mu.test(baseChangelog))
    ) {
      throw new Error(`${name}: Initial release is only for the unprepared initial 0.1.0 version.`);
    }

    if (type !== 'No release') {
      releaseNotes(changelog, version);
    }
  }
}

export async function validatePullRequest({ branch, subjects, title }) {
  if (!/^config-(?!00000)\d{5}$/u.test(branch)) {
    throw new Error('PR branches must use config-xxxxx with an ID from 00001 to 99999.');
  }

  const config = await load(repositoryConfig);

  for (const [label, subject] of [
    ['PR title', title],
    ...subjects.map((subject, index) => [`Commit ${index + 1}`, subject]),
  ]) {
    const result = await lint(subject, config.rules, {
      defaultIgnores: config.defaultIgnores,
      plugins: config.plugins,
    });

    if (!result.valid || !subject.includes(`(${branch}): `)) {
      throw new Error(`${label} must use type(${branch}): lowercase description: ${subject}`);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { pull_request: pullRequest } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
  );

  if (!pullRequest) {
    throw new Error('PR validation requires a pull_request event.');
  }

  const subjects = execFileSync(
    'git',
    ['log', '--no-merges', '--format=%s', `${pullRequest.base.sha}..${pullRequest.head.sha}`],
    { encoding: 'utf8' },
  ).trim();

  await validatePullRequest({
    branch: pullRequest.head.ref,
    subjects: subjects ? subjects.split('\n') : [],
    title: pullRequest.title,
  });

  const readAt = (sha, path) =>
    execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8' });
  const lock = JSON.parse(readAt(pullRequest.head.sha, 'package-lock.json'));
  const packages = Object.fromEntries(
    packageNames.map((name) => {
      const path = `packages/${name}`;
      const base = JSON.parse(readAt(pullRequest.base.sha, `${path}/package.json`));
      const head = JSON.parse(readAt(pullRequest.head.sha, `${path}/package.json`));

      return [
        name,
        {
          baseChangelog: readAt(pullRequest.base.sha, `${path}/CHANGELOG.md`),
          baseVersion: base.version,
          changelog: readAt(pullRequest.head.sha, `${path}/CHANGELOG.md`),
          lockVersion: lock.packages[path]?.version,
          version: head.version,
        },
      ];
    }),
  );

  validatePackageReleases({ body: pullRequest.body ?? '', packages });
}
