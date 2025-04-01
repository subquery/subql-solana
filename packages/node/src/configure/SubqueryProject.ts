// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  parseSolanaProjectManifest,
  SubqlSolanaDataSource,
  isRuntimeDs,

  isCustomDs,
} from '@subql/common-solana';
import { BaseSubqueryProject, CronFilter } from '@subql/node-core';
import { Reader } from '@subql/types-core';
import {
  SolanaHandlerKind,
  SolanaNetworkConfig,
  RuntimeDatasourceTemplate,
  CustomDatasourceTemplate,
  SolanaBlockFilter,
} from '@subql/types-solana';

const { version: packageVersion } = require('../../package.json');

export type SolanaProjectDs = SubqlSolanaDataSource;

export type SolanaProjectDsTemplate =
  | RuntimeDatasourceTemplate
  | CustomDatasourceTemplate;

export type SubqlProjectBlockFilter = SolanaBlockFilter & CronFilter;

// This is the runtime type after we have mapped genesisHash to chainId and endpoint/dict have been provided when dealing with deployments
type NetworkConfig = SolanaNetworkConfig & { chainId: string };

export type SubqueryProject = BaseSubqueryProject<
  SolanaProjectDs,
  SolanaProjectDsTemplate,
  NetworkConfig
>;

export async function createSubQueryProject(
  path: string,
  rawManifest: unknown,
  reader: Reader,
  root: string, // If project local then directory otherwise temp directory
  networkOverrides?: Partial<NetworkConfig>,
): Promise<SubqueryProject> {
  const project = await BaseSubqueryProject.create<SubqueryProject>({
    parseManifest: (raw) => parseSolanaProjectManifest(raw).asV1_0_0,
    path,
    rawManifest,
    reader,
    root,
    nodeSemver: packageVersion,
    blockHandlerKind: SolanaHandlerKind.Block,
    networkOverrides,
    isRuntimeDs,
    isCustomDs,
  });

  return project;
}
