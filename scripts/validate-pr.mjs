import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import repositoryConfig from '../commitlint.config.mjs';

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
}
