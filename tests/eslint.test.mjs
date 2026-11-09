import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import { createTypeScriptConfig } from '@cgcnnunes/eslint-config/typescript';
import { ESLint } from 'eslint';
import globals from 'globals';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

function createLinter(config) {
  return new ESLint({ cwd: root, overrideConfig: config, overrideConfigFile: true });
}

test('JavaScript config enforces semantic, sorting, spacing and quote rules', async () => {
  const eslint = createLinter(createJavaScriptConfig());

  const [result] = await eslint.lintText(
    'export var value = { zebra: "z", apple: "a" };\nif (value == 1) value = {};\n',
    { filePath: 'fixture.mjs' },
  );

  const rules = result.messages.map((message) => message.ruleId);

  for (const expected of [
    '@stylistic/padding-line-between-statements',
    '@stylistic/quotes',
    'curly',
    'eqeqeq',
    'no-var',
    'perfectionist/sort-objects',
  ]) {
    assert.ok(rules.includes(expected), `${expected}: ${JSON.stringify(result.messages)}`);
  }
});

test('runtime globals are explicit and rule overrides stay local', async () => {
  const source = "console.log('hello');\n";

  const [withoutGlobals] = await createLinter(createJavaScriptConfig()).lintText(source, {
    filePath: 'fixture.mjs',
  });

  const [withGlobals] = await createLinter(
    createJavaScriptConfig({ globals: globals.node }),
  ).lintText(source, { filePath: 'fixture.mjs' });

  const [override] = await createLinter([
    ...createJavaScriptConfig(),
    { rules: { 'no-console': 'error' } },
  ]).lintText(source, { filePath: 'fixture.mjs' });

  assert.ok(withoutGlobals.messages.some((message) => message.ruleId === 'no-undef'));

  assert.equal(withGlobals.errorCount, 0);

  assert.ok(override.messages.some((message) => message.ruleId === 'no-console'));
});

test('file selection does not impose rules on unrelated paths', async () => {
  const config = createJavaScriptConfig({ files: ['tools/**/*.mjs'] });

  const eslint = createLinter(config);

  const selected = await eslint.calculateConfigForFile('tools/task.mjs');

  const unrelated = await eslint.calculateConfigForFile('other.mjs');

  assert.equal(selected.rules.eqeqeq[0], 2);

  assert.equal(unrelated.rules?.eqeqeq, undefined);
});

test('side-effect imports and arrays preserve their order', async () => {
  const config = createJavaScriptConfig();

  const eslint = new ESLint({
    cwd: root,
    fix: true,
    overrideConfig: config,
    overrideConfigFile: true,
  });

  const source = "import './z.mjs';\nimport './a.mjs';\n\nexport const values = ['z', 'a'];\n";

  const [result] = await eslint.lintText(source, { filePath: 'fixture.mjs' });

  assert.equal(result.errorCount, 0);

  assert.equal(result.output ?? source, source);
});

test('typed preset validates the consumer root', () => {
  assert.throws(() => createTypeScriptConfig(), /absolute path/u);

  assert.throws(() => createTypeScriptConfig({ tsconfigRootDir: 'relative' }), /absolute path/u);
});

test('typed preset accepts a valid consumer project without enabling JS typed parsing', async () => {
  const eslint = createLinter([
    ...createJavaScriptConfig(),
    ...createTypeScriptConfig({ tsconfigRootDir: root }),
  ]);

  const [typed] = await eslint.lintFiles('tests/fixtures/typed/valid.ts');

  const [javascript] = await eslint.lintText("export const value = 'ok';\n", {
    filePath: 'fixture.mjs',
  });

  assert.deepEqual(typed.messages, []);

  assert.deepEqual(javascript.messages, []);
});

test('typed rules catch floating promises and missing explicit returns', async () => {
  const eslint = createLinter(createTypeScriptConfig({ tsconfigRootDir: root }));

  const [result] = await eslint.lintText(
    "export function greeting() {\n  Promise.resolve('hello');\n\n  return 'hello';\n}\n",
    { filePath: 'tests/fixtures/typed/valid.ts' },
  );

  const rules = result.messages.map((message) => message.ruleId);

  assert.ok(rules.includes('@typescript-eslint/explicit-function-return-type'));

  assert.ok(rules.includes('@typescript-eslint/no-floating-promises'));
});

test('typed preset explicitly preserves defensive conditions and numeric interpolation', async () => {
  const eslint = createLinter(createTypeScriptConfig({ tsconfigRootDir: root }));

  const config = await eslint.calculateConfigForFile('tests/fixtures/typed/valid.ts');

  assert.equal(config.rules['@typescript-eslint/no-unnecessary-condition'][0], 0);

  assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 2);

  assert.equal(config.rules['@typescript-eslint/no-non-null-assertion'][0], 2);

  assert.equal(
    config.rules['@typescript-eslint/restrict-template-expressions'][1].allowNumber,
    true,
  );
});
