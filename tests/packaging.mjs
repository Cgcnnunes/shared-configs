import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

function npm(args, cwd) {
  assert.ok(process.env.npm_execpath, 'Run this test through npm run test:package.');

  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 240_000,
  });

  assert.ifError(result.error);

  assert.equal(result.status, 0, `npm ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);

  return result.stdout;
}

test('packed packages work in an isolated consumer, including TypeScript declarations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cgcnnunes-shared-configs-'));

  try {
    const git = spawnSync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
    });

    assert.ifError(git.error);

    assert.equal(git.status, 0, git.stdout + git.stderr);

    const packages = JSON.parse(
      npm(
        ['pack', '--workspaces', '--ignore-scripts', '--pack-destination', directory, '--json'],
        root,
      ),
    );

    assert.equal(packages.length, 3);

    for (const pkg of packages) {
      const paths = pkg.files.map((file) => file.path);

      for (const required of [
        'package.json',
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
        'index.mjs',
        'index.d.ts',
      ]) {
        assert.ok(paths.includes(required), `${pkg.name} is missing ${required}`);
      }

      assert.equal(
        paths.some((path) => /(?:node_modules|tests|\.env)/u.test(path)),
        false,
      );
    }

    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@commitlint/cli': '^21.2.4',
          eslint: '^10.14.0',
          prettier: '^3.9.10',
          typescript: '~6.0.3',
          ...Object.fromEntries(packages.map((pkg) => [pkg.name, `file:./${pkg.filename}`])),
        },
        name: 'shared-configs-consumer-test',
        overrides: { minimatch: '^11.0.1' },
        prettier: '@cgcnnunes/prettier-config',
        private: true,
        scripts: {
          check: 'tsc --noEmit',
          'commit:invalid': 'commitlint --edit invalid-commit.txt',
          'commit:valid': 'commitlint --edit valid-commit.txt',
          format: 'prettier format.mjs --write',
          lint: 'eslint valid.ts valid.mjs --max-warnings 0',
          'lint:invalid': 'eslint invalid.mjs --max-warnings 0',
        },
        type: 'module',
      }),
    );

    writeFileSync(
      join(directory, 'eslint.config.mjs'),
      `import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import { createTypeScriptConfig } from '@cgcnnunes/eslint-config/typescript';
export default [
  ...createJavaScriptConfig(),
  ...createTypeScriptConfig({ tsconfigRootDir: import.meta.dirname }),
];
`,
    );

    writeFileSync(
      join(directory, 'commitlint.config.mjs'),
      `import { createCommitlintConfig } from '@cgcnnunes/commitlint-config';
export default createCommitlintConfig({ appName: 'consumer-app' });
`,
    );

    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2023',
        },
        include: ['*.ts', '*.mts'],
      }),
    );

    writeFileSync(join(directory, 'valid.mjs'), "export const message = 'hello';\n");

    writeFileSync(
      join(directory, 'valid.ts'),
      'export function greeting(name: string): string {\n  return name;\n}\n',
    );

    writeFileSync(join(directory, 'invalid.mjs'), 'export var message = "bad";\n');

    writeFileSync(join(directory, 'valid-commit.txt'), 'feat(consumer-app-00001): add settings\n');

    writeFileSync(join(directory, 'invalid-commit.txt'), 'feat(reader-00001): add settings\n');

    writeFileSync(join(directory, 'format.mjs'), 'export const message="hello"\r\n');

    writeFileSync(
      join(directory, 'declarations.mts'),
      `import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import { createTypeScriptConfig } from '@cgcnnunes/eslint-config/typescript';
import { createCommitlintConfig } from '@cgcnnunes/commitlint-config';
import prettier from '@cgcnnunes/prettier-config';
import type { Linter } from 'eslint';
import type { UserConfig } from '@commitlint/types';
import type { Config } from 'prettier';
const js: Linter.Config[] = createJavaScriptConfig({ globals: { console: 'readonly' } });
const ts: Linter.Config[] = createTypeScriptConfig({ tsconfigRootDir: '/consumer' });
const commits: UserConfig = createCommitlintConfig({ appName: 'consumer-app' });
const format: Config = prettier;
// @ts-expect-error App names are required.
createCommitlintConfig({});
// @ts-expect-error TypeScript projects require their own root.
createTypeScriptConfig({});
// @ts-expect-error A file selection is an array.
createJavaScriptConfig({ files: 'src/*.js' });
export { js, ts, commits, format };
`,
    );

    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);

    npm(['run', 'check'], directory);

    npm(['run', 'lint'], directory);

    npm(['run', 'commit:valid'], directory);

    npm(['run', 'format'], directory);

    assert.equal(
      readFileSync(join(directory, 'format.mjs'), 'utf8'),
      "export const message = 'hello';\n",
    );

    for (const command of ['lint:invalid', 'commit:invalid']) {
      const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', command], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30_000,
      });

      assert.ifError(result.error);

      assert.equal(result.status, 1, `${command}: ${result.stdout}\n${result.stderr}`);

      assert.match(
        result.stdout + result.stderr,
        command === 'lint:invalid' ? /no-var/u : /app-subject/u,
      );
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('a Commitlint-only patch keeps other workspace and lockfile versions unchanged', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cgcnnunes-config-versions-'));
  const workspaces = ['eslint-config', 'prettier-config', 'commitlint-config'];
  const readJson = (base, path) => JSON.parse(readFileSync(join(base, path), 'utf8'));

  try {
    for (const path of ['package.json', 'package-lock.json']) {
      writeFileSync(join(directory, path), readFileSync(join(root, path)));
    }

    for (const workspace of workspaces) {
      const path = join('packages', workspace);

      mkdirSync(join(directory, path), { recursive: true });

      writeFileSync(
        join(directory, path, 'package.json'),
        readFileSync(join(root, path, 'package.json')),
      );
    }

    npm(
      [
        'version',
        'patch',
        '--workspace',
        '@cgcnnunes/commitlint-config',
        '--no-git-tag-version',
        '--ignore-scripts',
      ],
      directory,
    );

    const originalLock = readJson(root, 'package-lock.json');
    const updatedLock = readJson(directory, 'package-lock.json');

    assert.deepEqual(readJson(directory, 'package.json'), readJson(root, 'package.json'));

    assert.equal(updatedLock.version, originalLock.version);

    for (const workspace of workspaces) {
      const path = join('packages', workspace, 'package.json');
      const lockKey = `packages/${workspace}`;
      const original = readJson(root, path);
      const updated = readJson(directory, path);
      const [major, minor, patch] = original.version.split('.').map(Number);
      const version =
        workspace === 'commitlint-config' ? `${major}.${minor}.${patch + 1}` : original.version;

      assert.deepEqual(updated, { ...original, version });

      assert.deepEqual(updatedLock.packages[lockKey], {
        ...originalLock.packages[lockKey],
        version,
      });
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
