# @cgcnnunes/prettier-config

Prettier 3 defaults: single quotes, semicolons, two-space indentation, trailing commas, LF endings,
100-character print width, wrapped prose and arrow parentheses. Requires Node 22.22.2+ in the 22.x
line, or Node 24+. ESM only.

Install the package and Prettier, then add to your application's package.json:

```json
{
  "prettier": "@cgcnnunes/prettier-config"
}
```

For local overrides, use prettier.config.mjs instead:

```js
import config from '@cgcnnunes/prettier-config';

export default { ...config, printWidth: 120 };
```

Keep ignore patterns local. See the repository README for pinned installation and release
instructions.

License: UNLICENSED; all rights reserved. Public availability is not an open-source permission
grant.
