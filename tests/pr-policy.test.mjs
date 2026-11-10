import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePullRequest } from '../scripts/validate-pr.mjs';

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
