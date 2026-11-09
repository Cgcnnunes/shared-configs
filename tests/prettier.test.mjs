import config from '@cgcnnunes/prettier-config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { format, resolveConfig } from 'prettier';

test('formats code using the shared defaults', async () => {
  const result = await format('const greeting=(name)=>{return "hello "+name}\r\n', {
    ...config,
    parser: 'babel',
  });

  assert.equal(result, "const greeting = (name) => {\n  return 'hello ' + name;\n};\n");

  assert.deepEqual(config, {
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 100,
    proseWrap: 'always',
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
  });
});

test('resolves the package from the root package.json prettier field', async () => {
  const resolved = await resolveConfig(new URL('../package.json', import.meta.url));

  assert.deepEqual(resolved, config);
});
