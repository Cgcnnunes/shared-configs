import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';

export function createJavaScriptConfig({ files = ['**/*.{js,mjs,cjs}'], globals = {} } = {}) {
  return [
    { ...js.configs.recommended, files },
    {
      files,
      languageOptions: { globals },
      plugins: { '@stylistic': stylistic, perfectionist },
      rules: {
        '@stylistic/padding-line-between-statements': [
          'error',
          { blankLine: 'always', next: '*', prev: '*' },
          { blankLine: 'any', next: 'import', prev: 'import' },
          { blankLine: 'any', next: 'export', prev: 'export' },
          { blankLine: 'any', next: ['const', 'let'], prev: ['const', 'let'] },
        ],
        eqeqeq: ['error', 'always'],
        'no-var': 'error',
        'perfectionist/sort-exports': ['error', { order: 'asc', type: 'alphabetical' }],
        'perfectionist/sort-imports': [
          'error',
          { newlinesBetween: 0, order: 'asc', sortSideEffects: false, type: 'alphabetical' },
        ],
        'perfectionist/sort-interfaces': ['error', { order: 'asc', type: 'alphabetical' }],
        'perfectionist/sort-named-exports': ['error', { order: 'asc', type: 'alphabetical' }],
        'perfectionist/sort-named-imports': ['error', { order: 'asc', type: 'alphabetical' }],
        'perfectionist/sort-object-types': ['error', { order: 'asc', type: 'alphabetical' }],
        'perfectionist/sort-objects': ['error', { order: 'asc', type: 'alphabetical' }],
        'prefer-const': 'error',
      },
    },
    { ...prettier, files },
    {
      files,
      rules: {
        '@stylistic/quotes': [
          'error',
          'single',
          { allowTemplateLiterals: 'always', avoidEscape: true },
        ],
        curly: ['error', 'all'],
      },
    },
  ];
}
