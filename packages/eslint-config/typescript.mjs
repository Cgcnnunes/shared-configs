import { defineConfig } from 'eslint/config';
import { isAbsolute } from 'node:path';
import tseslint from 'typescript-eslint';
import { createJavaScriptConfig } from './index.mjs';

export function createTypeScriptConfig({
  files = ['**/*.{ts,tsx,mts,cts}'],
  globals = {},
  tsconfigRootDir,
} = {}) {
  if (typeof tsconfigRootDir !== 'string' || !isAbsolute(tsconfigRootDir)) {
    throw new TypeError('tsconfigRootDir must be an absolute path to the consuming project.');
  }

  return defineConfig(...createJavaScriptConfig({ files, globals }), {
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    files,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  });
}
