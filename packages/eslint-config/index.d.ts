import type { Linter } from 'eslint';

export interface JavaScriptConfigOptions {
  files?: string[];
  globals?: Linter.Globals;
}

export declare function createJavaScriptConfig(options?: JavaScriptConfigOptions): Linter.Config[];
