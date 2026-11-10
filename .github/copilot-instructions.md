# Repository conventions

- Name work branches `config-xxxxx` (five digits, 00001-99999), without type prefixes or slashes.
- Use one ID per branch/PR. Every commit subject and the PR title must use that exact branch name as
  its scope, for example branch `config-00008` and `fix(config-00008): handle invalid input`.
- Before creating a branch, inspect local/remote branches and commit subjects and select the next
  unused ID. Do not increment the ID for additional commits on that branch. Ask if IDs conflict.
- Follow the repository Commitlint types: feat, chore, refactor, fix, doc. Do not rewrite merged
  history to retrofit these rules.
- Follow the [unit-test naming conventions](../README.md#unit-test-naming-conventions):
  `mock<Subject>` for test doubles and `spy<Subject>` for spies and recorded observations.
- Use Node 24.x and run `npm run verify` before completing code changes. See the
  [README](../README.md) for compatibility, development and release procedures.
