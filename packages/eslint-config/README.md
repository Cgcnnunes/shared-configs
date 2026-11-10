# @cgcnnunes/eslint-config

ESLint 10 flat configs for JavaScript and type-aware TypeScript. Requires Node >=24.0.0 <25.0.0
(24.x LTS). ESM only. See the repository README for installation, composition, compatibility and
release instructions.

Current transitive tooling needs a minimatch ^11.0.1 override in the consumer's root package.json
for GHSA-g3hv-75wg-m249. npm does not propagate overrides from dependencies. See the repository
README for the exact setting.

```js
import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import { createTypeScriptConfig } from '@cgcnnunes/eslint-config/typescript';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  ...createJavaScriptConfig(),
  ...createTypeScriptConfig({ tsconfigRootDir: import.meta.dirname }),
];
```

JavaScript defaults to `**/*.{js,mjs,cjs}`; TypeScript defaults to `**/*.{ts,tsx,mts,cts}`. Both
factories accept `files` and `globals`. No runtime globals are assumed: pass `globals.node`,
`globals.browser`, or the globals appropriate to each file group. TypeScript needs an installed
compatible TypeScript version and a tsconfig including the linted files. The root directory must be
the consumer's absolute path, never this package's directory.

The presets enable recommended JavaScript rules, alphabetical semantic sorting, statement spacing,
braces, strict equality, single quotes and Prettier-compatible formatting. The TypeScript preset
adds strict/stylistic type-aware rules, explicit function returns, type-only imports and bans on
explicit any/non-null assertions. Defensive conditions and numeric interpolation remain allowed.
Later config entries can override rules. Side-effect import ordering and array ordering are
preserved. JSX/TSX parsing does not provide React-specific rules. React and Cloudflare-specific
presets are not yet provided.

License: UNLICENSED; all rights reserved. Public availability is not an open-source permission
grant.
