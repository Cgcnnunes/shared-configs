# Shared configs

Versioned tooling packages for applications owned by Cgcnnunes. Each application installs a
published version and keeps its runtime, deployment and Git-history policies local. This repository
does not change consumer repositories automatically.

| Package                      | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| @cgcnnunes/eslint-config     | JavaScript and strict, type-aware TypeScript flat configs |
| @cgcnnunes/prettier-config   | Shared Prettier formatting                                |
| @cgcnnunes/commitlint-config | App-specific five-digit commit scope factory              |

## Status and compatibility

Each package has an independent version and its own [changelog](CHANGELOG.md). Initial versions are
all 0.1.0, but future versions do not need to match. Packages are not published yet; the
installation examples below become available only after the first npm publication. Owning the GitHub
username does not establish npm scope ownership. Confirm access to the cgcnnunes npm account before
publishing.

Requires Node 24.x LTS (`>=24.0.0 <25.0.0`), npm 10+, and ESM configuration files. Tested tool
majors: ESLint 10, Prettier 3 and Commitlint 21. TypeScript must be >=4.8.4 and <6.1.0;
development/tests use 6.0.x because the current parser does not support TypeScript 7. Peer ranges
declare supported versions; upgrade them with compatibility tests.

These are JavaScript configuration modules with TypeScript declarations, not an application
requiring a compile step. React-specific rules, Cloudflare globals, tsconfig presets and reusable
consumer workflows are not provided. This repository includes a manual per-package release workflow.

## Use in an app

After publication:

```sh
npm install --save-dev --save-exact @cgcnnunes/eslint-config@0.1.0 @cgcnnunes/prettier-config@0.1.0 @cgcnnunes/commitlint-config@0.1.0
npm install --save-dev eslint@10 prettier@3 @commitlint/cli@21 globals@17 typescript@~6.0.3
```

For the current dependency tree, add this override to the consuming application's root package.json,
then run npm install:

```json
{
  "overrides": {
    "minimatch": "^11.0.1"
  }
}
```

This avoids the glob amplification advisory GHSA-g3hv-75wg-m249 in transitive lint tooling. npm
overrides in this repository do not propagate through published packages. The isolated consumer test
uses the same override and exercises lint compatibility. Keep it until all upstream ranges resolve
to patched versions; merge with existing root overrides rather than replacing them.

Omit TypeScript and the TypeScript preset in JavaScript-only apps. Omit unused config packages and
their tools. Commit the lockfile and use npm ci in CI.

Create eslint.config.mjs:

```js
import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import { createTypeScriptConfig } from '@cgcnnunes/eslint-config/typescript';
import globals from 'globals';

export default [
  { ignores: ['coverage/**', 'dist/**'] },
  ...createJavaScriptConfig({ globals: globals.node }),
  ...createTypeScriptConfig({
    globals: globals.browser,
    tsconfigRootDir: import.meta.dirname,
  }),
];
```

Choose runtime globals per file group. For example, split browser and server TypeScript into
separate factory calls with different files patterns. Include linted TypeScript files in the app's
tsconfig; projectService resolves their projects. Keep app-specific ignores and rule overrides
local.

Add `"prettier": "@cgcnnunes/prettier-config"` to the application's package.json. Remove a
conflicting old Prettier config when adopting the package, or explicitly import and extend it in
prettier.config.mjs.

Create commitlint.config.mjs:

```js
import { createCommitlintConfig } from '@cgcnnunes/commitlint-config';

export default createCommitlintConfig({ appName: 'reader' });
```

Change appName for each app, for example my-app. This accepts `feat(reader-00001): add settings` or,
for my-app, `fix(my-app-00042): handle an expired session`. Allowed types are feat, chore, refactor,
fix and doc; exactly five digits (00001-99999), a lowercase initial description and a maximum
120-character subject are required. No trailing wrapper parenthesis. This checks format only, not
increasing numbers or branch naming.

To retain an app's local history rule, compose both plugins and rules:

```js
const shared = createCommitlintConfig({ appName: 'reader' });

export default {
  ...shared,
  plugins: [{ rules: { ...shared.plugins[0].rules, ...localHistoryPlugin.rules } }],
  rules: { ...shared.rules, 'local-sequence': [2, 'always'] },
};
```

Here localHistoryPlugin is the app's existing rule implementation. Merge inline rules into one
plugin: Commitlint replaces separate inline plugin entries rather than combining them. Commitlint
skips completely empty messages before custom rules run; Git normally rejects empty messages itself.
Importing a package does not install hooks or make CI enforce rules. Configure commit-msg to run
`npx --no-install commitlint --edit "$1"` in your chosen hook manager and validate the actual commit
range or squash PR title in CI. For a manual check:

```sh
echo "feat(reader-00001): add settings" | npx --no-install commitlint
```

## Develop and validate

Use Node 24.x locally; [.nvmrc](.nvmrc) selects that major. Install and activate Node 24 in your
version manager before running npm commands. Both validation and release workflows read this file
and select the latest available 24.x patch, without a multi-version matrix. The packages declare
compatibility with the full 24.x range, but CI does not separately test its minimum version.
[.npmrc](.npmrc) enables engine-strict so npm installs reject unsupported Node versions.

Each published package declares `engines.node: ">=24.0.0 <25.0.0"`: the minimum is inclusive and the
maximum exclusive. npm reads this metadata when consumers install the package, warning about
unsupported runtimes by default. To reject incompatible installs, consuming repositories should also
commit a root `.npmrc` containing `engine-strict=true`. This repository's .npmrc is not inherited by
consumers. Version files select Node; package engine metadata declares compatibility.

```sh
npm ci
npm run lint:fix
npm run format
npm run verify
```

Verify checks formatting, lint, behavioral tests and an isolated packaging test. The latter packs
all three workspaces, installs their tarballs and peer tools in a temporary consumer outside this
repository, then tests real ESLint, Prettier, Commitlint and declaration imports. It needs npm
registry access and Git, and removes its own temporary directories afterward. A separate isolated
workspace check verifies that a Commitlint-only version bump preserves the other package versions
and their lockfile records. No consumer app is modified.

Both workflows cache npm downloads through setup-node, keyed by runner OS/architecture and the root
lockfile. Clean npm ci installs still run every time. Installs prefer cached downloads and fetch
missing packages from the registry; the isolated consumer test uses the same npm cache. Neither
node_modules nor verification results are cached, and cache hits never bypass release safeguards.
GitHub cache branch scoping applies: PR caches do not become trusted main-branch release caches. The
--prefer-offline flag skips freshness checks for cached downloads; it does not disable network
access. npm ci still honors exact lockfile versions and verifies downloaded package integrity.

Tests cover configurable app scopes, malformed subjects and exact length limits, formatting, sorting
and semantic lint rules, explicit runtime globals, typed linting and tsconfig paths, local overrides
and published exports/declarations. Release tests cover version/changelog checks, publication
ordering, conflicts, artifact integrity and partial-release recovery without contacting npm or
GitHub. Workflow policy tests parse YAML structurally rather than depending on its formatting.

### Unit-test naming conventions

Prefix every test double with `mock` followed by the mocked subject in PascalCase, such as
`mockRequest`, `mockRun`, `mockPause` or `mockPublished`. This applies to replacement functions,
stubbed values, simulated state, mock options, dependency bundles and mock factories. Prefix spies
and recorded observations with `spy`, such as `spyRequest` or `spyCalls`. When a replacement both
simulates behavior and records calls, use `mock` for the replacement and `spy` for its call history.
Preserve production interface keys through explicit mappings, for example
`{ request: mockRequest }`. Ordinary test inputs, real filesystem fixtures, assertions and helpers
that invoke real implementations do not need either prefix. Follow this convention for all new and
modified unit tests.

## Releases and account setup

Use branches named `config-xxxxx`, with exactly five digits from 00001 to 99999 and no prefix or
slash. Allocate one unused ID per branch/PR by checking local/remote branches and existing commit
subjects; use the next unused number. Keep that ID for every commit on the branch and the PR title:
for branch `config-00008`, use `feat(config-00008): add a preset` or
`fix(config-00008): correct a preset`. Do not increment the ID for subsequent commits in the same
PR. Allowed types are feat, chore, refactor, fix and doc; descriptions start with a lowercase ASCII
letter and the complete subject must be at most 120 characters.

Only this repository uses appName config. Consumer apps keep their own appName and local Git
policies; the published Commitlint factory does not enforce branches or allocate IDs. Repository PR
validation checks branch names, PR titles and every non-merge commit introduced by the PR.
Git-generated merge commits are excluded. Existing merged history is not rewritten or retroactively
checked. There are no installed Git hooks. CI runs npm run verify on PRs and main pushes; configure
branch protection to require Validate separately. Squash merges should retain the validated PR
title.

### One-time account and workflow setup

1. Sign in to the cgcnnunes npm account in your own terminal and configure npm two-factor
   authentication. Do not put tokens, recovery codes or credentials in this repository or chat.
2. Verify account ownership with npm whoami. Confirm all three scoped names are available and that
   public distribution under UNLICENSED is intended.
3. Create a GitHub environment named `npm`, restrict deployments to `main`, and optionally require
   approval. Ensure repository rules allow the release workflow's GITHUB_TOKEN to create package
   tags. Protect `main` with PR review and required validation checks.
4. Bootstrap each package with a first manual publication: npm trusted publisher settings are
   configured on existing packages. First prepare a dated 0.1.0 changelog entry as described below,
   merge the reviewed PR, then check out that exact main commit in a clean worktree. Run npm ci, npm
   run verify and npm pack --workspaces --dry-run before publishing:

   ```sh
   npm publish --workspace @cgcnnunes/eslint-config --access public
   npm publish --workspace @cgcnnunes/prettier-config --access public
   npm publish --workspace @cgcnnunes/commitlint-config --access public
   ```

   The private workspace root is not published. Publishing is not atomic; verify each
   package/version before retrying a partial failure. Use the recovery procedure below to create the
   initial tags and GitHub releases from the same commit.

5. In **each package's npm settings**, add a GitHub Actions trusted publisher:
   - Organization or user: `Cgcnnunes`
   - Repository: `shared-configs`
   - Workflow filename: `release.yml`
   - Environment: `npm`
   - Allow direct publishing with `npm publish`.

   Trusted publishing uses GitHub OIDC; no NPM_TOKEN or NODE_AUTH_TOKEN secret is required.
   Configure each publisher shortly before its first automated publication: npm currently requires
   validation by a successful publish within two days of configuration. Recovery does not publish
   and therefore does not validate this configuration. Recreate an expired publisher if needed. The
   workflow uses a GitHub-hosted runner, Node 24 and npm 11 (OIDC requires npm >=11.5.1). Keep the
   source repository public for provenance. Review the
   [npm trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/) and
   [provenance transparency notice](https://docs.npmjs.com/generating-provenance-statements/) before
   enabling publication.

### Prepare an independent release

Only bump and publish packages whose shipped content or compatibility changed. The private root
version is not a release train. For a compatible Commitlint-only fix, run from the repository root:

```sh
npm version patch --workspace @cgcnnunes/commitlint-config --no-git-tag-version
```

This updates that package's manifest and the root lockfile, leaving ESLint and Prettier versions
unchanged. For the first release, keep the prepared 0.1.0 version rather than bumping it.

Record changes under Unreleased in the affected package's CHANGELOG.md. When preparing publication,
move them into the selected version heading with its release date (YYYY-MM-DD); replace the initial
unreleased heading for a first publication. Keep the Unreleased section for future changes. Update
that package's README when adoption or behavior changes. Do not add entries or bump versions for
unaffected packages.

Run npm run lint:fix, npm run format and npm run verify, then commit the affected manifest,
changelog, documentation, tests, implementation and root lockfile together through a reviewed PR.

In the PR template, select exactly one release type for **each** package:

| Selection       | Required version change                                |
| --------------- | ------------------------------------------------------ |
| Major           | `1.2.3` → `2.0.0` (reset minor and patch)              |
| Minor           | `1.2.3` → `1.3.0` (reset patch)                        |
| Patch           | `1.2.3` → `1.2.4`                                      |
| Initial release | Keep unprepared initial `0.1.0`; prepare dated notes   |
| No release      | Keep version unchanged (including repository-only PRs) |

PR validation compares base/head manifests and the head lockfile against these selections and
requires dated, nonempty changelog notes for every release selection. Initial release is allowed
only while the base changelog still marks 0.1.0 as an unreleased initial version. Select No release
for unaffected packages. Changes may accumulate under Unreleased without publishing. Checkboxes
neither edit files nor trigger publication: prepare the bumps yourself using
`npm version major|minor|patch --workspace <package> --no-git-tag-version`.

The committed version determines both npm's version and the package-specific Git tag:
`@cgcnnunes/eslint-config@1.2.3` corresponds to `eslint-config-v1.2.3`. The components are
major.minor.patch, without zero-padding; a generic repository-wide `v1.2.3` tag is not used. The
release workflow never reads PR checkboxes or invents a second version.

### Publish the merged version

In GitHub Actions, open [Release package](.github/workflows/release.yml), select **Run workflow**,
choose branch `main` and the affected package, and leave **recover** unchecked. Approve the `npm`
environment deployment if configured. Repeat separately for any other changed packages.

The workflow checks out the immutable commit selected at dispatch, installs dependencies and runs
npm run verify. It rejects non-main runs, dirty worktrees, inconsistent manifest/lockfile versions,
unprepared changelogs, and existing npm versions, tags or GitHub releases. Only stable x.y.z
versions are supported; prereleases are intentionally not handled.

The separate Validate workflow also runs on PRs and pushes to main. Release does not wait for or
inspect that workflow's result: its own full verification is the publication gate. Wait for the
main-push validation to succeed before dispatching a release. Both use the same Node major and
verification command, but the latest patch may change between runs.

It packs only the selected package, publishes that exact tarball publicly to npm with provenance
(generated automatically by trusted publishing), and verifies the registry's version and SHA-512
integrity against the local artifact. Only then does it push a package tag and create a GitHub
release with that package's changelog entry:

| npm package                  | Example version | GitHub tag               |
| ---------------------------- | --------------- | ------------------------ |
| @cgcnnunes/eslint-config     | 0.2.0           | eslint-config-v0.2.0     |
| @cgcnnunes/prettier-config   | 0.1.1           | prettier-config-v0.1.1   |
| @cgcnnunes/commitlint-config | 0.1.1           | commitlint-config-v0.1.1 |

Multiple tags can point to the same commit. GitHub releases are not marked as the repository-wide
"latest" release because packages have independent versions. npm receives the package version, not
the Git tag; stable publications use npm's `latest` dist-tag. Release runs are serialized per
package; active runs are not cancelled by later dispatches. The concurrency queue retains up to 100
pending runs per package; additional runs are cancelled when that queue is full. Different packages
can release in parallel. Duplicate normal dispatches fail the existing-version checks rather than
republishing.

Consumers can update just the released package:

```sh
npm install --save-dev --save-exact @cgcnnunes/commitlint-config@0.1.1
```

Do not republish a version or move a published tag. Use a major version for breaking defaults, newly
failing rules or dropped compatibility (even during this initial 0.x series), a minor version for
additive opt-in functionality, and a patch for compatible fixes. Consumers adopt exact version
updates through reviewed PRs; never import a moving Git branch as a shared configuration.

### Recover a partial release

npm publication and GitHub metadata creation cannot be atomic. If publication succeeds but registry
verification, tag push or GitHub release creation fails, inspect the failure before retrying. After
a successful publish, registry verification makes up to six attempts, waiting five seconds between
attempts when a version is not yet visible or a transient network/timeout, HTTP 408/429 or server
error occurs. Each request has a 30-second timeout. Authentication errors, malformed responses, and
version/integrity mismatches fail immediately. Exhausted retries fail without creating a tag.
Publication itself is never automatically retried within a job.

To recover, **re-run the original workflow run's failed jobs**, retaining its original commit and
inputs. Normal-mode re-runs check npm first: if the version exists, they verify its integrity and
recover missing metadata without republishing; if it is absent, they attempt normal publication.
Registry lookup errors stop the job rather than being treated as an absent version. Explicit
recovery remains recovery-only on every attempt and fails if npm has no version. Alternatively,
dispatch with **recover** checked only if `main` still points to the exact original release commit
(also use this for first-publication bootstrap). Do not dispatch from a newer main commit to repair
an older release.

Recovery never publishes to npm. It requires the npm version to exist and its tarball integrity to
match a fresh pack of the selected commit. Existing remote tags must point to that same commit;
inconsistent or draft GitHub releases are rejected. Only missing tags and GitHub releases are
created, and repeating a completed recovery is safe. If the artifact differs, stop and investigate;
do not overwrite tags, unpublish or attempt to reuse a version.

## License

UNLICENSED: all rights reserved, as selected by the repository owner. Public GitHub/npm visibility
does not grant an open-source license. See LICENSE.
