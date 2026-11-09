# @cgcnnunes/commitlint-config

A Commitlint 21 configuration factory. Requires Node 22.22.2+ in the 22.x line, or Node 24+. ESM
only.

```js
// commitlint.config.mjs in each consuming application
import { createCommitlintConfig } from '@cgcnnunes/commitlint-config';

export default createCommitlintConfig({ appName: 'reader' });
```

For another app, change only appName:

```js
export default createCommitlintConfig({ appName: 'my-app' });
```

Accepted subjects:

```text
feat(reader-00001): add settings
fix(my-app-00042): handle an expired session
```

Rules:

- Types: feat, chore, refactor, fix, doc.
- Required scope: the configured app slug plus a hyphen and exactly five digits, from 00001
  to 99999.
- App slugs contain lowercase ASCII letters/digits and single internal hyphens; start with a letter.
- Description starts with an ASCII lowercase letter.
- Whole subject is at most 120 characters, without a trailing wrapper parenthesis.
- Bodies and footers are allowed. Merge/revert/fixup subjects and breaking-change `!` syntax are not
  exempt; use a valid subject and a BREAKING CHANGE footer.

This validates the format, not Git history. It does not allocate numbers, require an increasing
sequence, name branches, enforce documentation changes or install hooks. Keep history-dependent
rules in each app. Merge local inline rules into the returned plugin's rules object and merge their
rule configuration; do not append a second inline plugin, because Commitlint replaces inline
entries. See the repository README for the tested composition example. Commitlint skips completely
empty messages before custom rules run; Git normally rejects them.

See the repository README for installation and enforcement examples.

License: UNLICENSED; all rights reserved. Public availability is not an open-source permission
grant.
