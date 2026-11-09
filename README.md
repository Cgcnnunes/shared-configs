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

Requires Node 22.22.2+ in the 22.x line, or Node 24+, npm 10+, and ESM configuration files. Tested
tool majors: ESLint 10, Prettier 3 and Commitlint 21. TypeScript must be >=4.8.4 and <6.1.0;
development/tests use 6.0.x because the current parser does not support TypeScript 7. Peer ranges
declare supported versions; upgrade them with compatibility tests.

These are JavaScript configuration modules with TypeScript declarations, not an application
requiring a compile step. React-specific rules, Cloudflare globals, tsconfig presets, reusable
workflows and release automation are not provided yet.

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

Tests cover configurable app scopes, malformed subjects and exact length limits, formatting, sorting
and semantic lint rules, explicit runtime globals, typed linting and tsconfig paths, local overrides
and published exports/declarations.

## Releases and account setup

Use feature branches and PRs. Only this repository uses appName config for commit subjects and PR
titles, for example `feat(config-00001): add a preset`. Consumer apps keep their own appName. The
config validates syntax but does not allocate IDs. There are no installed Git hooks. CI runs npm run
verify on PRs and main pushes; configure branch protection separately.

Before the first publication:

1. Sign in to the cgcnnunes npm account in your own terminal and configure npm two-factor
   authentication. Do not put tokens, recovery codes or credentials in this repository or chat.
2. Verify account ownership with npm whoami. Confirm all three scoped names are available and that
   public distribution under UNLICENSED is intended.
3. Run npm run verify, review package contents with npm pack --workspaces --dry-run, and review the
   release changes.
4. An authorized publisher publishes each reviewed package separately:

   ```sh
   npm publish --workspace @cgcnnunes/eslint-config --access public
   npm publish --workspace @cgcnnunes/prettier-config --access public
   npm publish --workspace @cgcnnunes/commitlint-config --access public
   ```

   The private workspace root is not published. Publishing is not atomic; verify each
   package/version before retrying a partial failure.

5. After verifying each published package, tag its exact release commit with the package name and
   version: eslint-config-v0.1.0, prettier-config-v0.1.0 and commitlint-config-v0.1.0. Multiple tags
   can point to the same commit. No automatic publishing workflow is configured.

### Subsequent independent releases

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
Publish the prepared version from the merged, verified commit:

```sh
npm publish --workspace @cgcnnunes/commitlint-config --access public
npm view @cgcnnunes/commitlint-config@0.1.1 version
git tag commitlint-config-v0.1.1
git push origin commitlint-config-v0.1.1
```

The example assumes the previous version was 0.1.0. Substitute the actual prepared version and
verify that npm reports it before creating/pushing the tag. Create a GitHub release for that tag
using that package's changelog entry. Consumers can update just this package:

```sh
npm install --save-dev --save-exact @cgcnnunes/commitlint-config@0.1.1
```

Do not republish a version or move a published tag. Use a major version for breaking defaults, newly
failing rules or dropped compatibility (even during this initial 0.x series), a minor version for
additive opt-in functionality, and a patch for compatible fixes. Consumers adopt exact version
updates through reviewed PRs; never import a moving Git branch as a shared configuration.

## License

UNLICENSED: all rights reserved, as selected by the repository owner. Public GitHub/npm visibility
does not grant an open-source license. See LICENSE.
