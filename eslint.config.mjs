import { createJavaScriptConfig } from '@cgcnnunes/eslint-config';
import globals from 'globals';

export default [
  { ignores: ['coverage/**', 'node_modules/**'] },
  ...createJavaScriptConfig({ globals: globals.node }),
];
