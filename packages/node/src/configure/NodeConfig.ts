// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { IConfig, NodeConfig } from '@subql/node-core';

// NOTE to extend IConfig, change the type to interface
export type ISolanaConfig = IConfig;

export class SolanaNodeConfig extends NodeConfig<ISolanaConfig> {
  /**
   * This is a wrapper around the core NodeConfig to get additional properties that are provided through args or node runner options
   * NOTE: This isn't injected anywhere so you need to wrap the injected node config
   *
   * @example
   * constructor(
   *   nodeConfig: NodeConfig,
   * ) {
   *   this.nodeConfig = new SolanaNodeConfig(nodeConfig);
   * }
   * */
  constructor(config: NodeConfig) {
    // Rebuild with internal config
    super((config as any)._config, (config as any)._isTest);
  }
}
