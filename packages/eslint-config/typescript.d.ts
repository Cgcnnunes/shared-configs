import type { Linter } from 'eslint';
import type { JavaScriptConfigOptions } from '@cgcnnunes/eslint-config';

export interface TypeScriptConfigOptions extends JavaScriptConfigOptions {
  tsconfigRootDir: string;
}

export declare function createTypeScriptConfig(options: TypeScriptConfigOptions): Linter.Config[];
