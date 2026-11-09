/// <reference types="node" />

import type { UserConfig } from '@commitlint/types';

export interface CommitlintConfigOptions {
  appName: string;
}

export declare function createCommitlintConfig(options: CommitlintConfigOptions): UserConfig;
