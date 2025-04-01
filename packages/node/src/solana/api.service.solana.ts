// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import assert from 'assert';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiService,
  ConnectionPoolService,
  getLogger,
  NodeConfig,
  IBlock,
  exitWithError,
} from '@subql/node-core';
import { IEndpointConfig } from '@subql/types-core';
import {
  SolanaNetworkConfig,
  ISolanaEndpointConfig,
  SolanaBlock,
} from '@subql/types-solana';
import { SubqueryProject } from '../configure/SubqueryProject';
import {
  SolanaApiConnection,
  FetchFunc,
  GetFetchFunc,
} from './api.connection';
import { SolanaApi, SolanaSafeApi } from './api.solana';
// import SafeEthProvider from './safe-api';

const logger = getLogger('api');

@Injectable()
export class SolanaApiService extends ApiService<
  SolanaApi,
  SolanaSafeApi,
  IBlock<SolanaBlock>[],
  SolanaApiConnection,
  ISolanaEndpointConfig
> {
  private fetchBlocksFunction?: FetchFunc;
  private fetchBlocksBatches: GetFetchFunc = () => {
    assert(this.fetchBlocksFunction, 'Fetch blocks function is not defined');
    return this.fetchBlocksFunction;
  };

  private constructor(
    @Inject('ISubqueryProject') private project: SubqueryProject,
    connectionPoolService: ConnectionPoolService<SolanaApiConnection>,
    eventEmitter: EventEmitter2,
  ) {
    super(connectionPoolService, eventEmitter);
  }

  static async init(
    project: SubqueryProject,
    connectionPoolService: ConnectionPoolService<SolanaApiConnection>,
    eventEmitter: EventEmitter2,
    nodeConfig: NodeConfig,
  ): Promise<SolanaApiService> {
    let network: SolanaNetworkConfig;
    try {
      network = project.network;
    } catch (e) {
      exitWithError(new Error(`Failed to init api`, { cause: e }), logger);
    }

    if (nodeConfig.primaryNetworkEndpoint) {
      const [endpoint, config] = nodeConfig.primaryNetworkEndpoint;
      (network.endpoint as Record<string, IEndpointConfig>)[endpoint] = config;
    }

    const apiService = new SolanaApiService(
      project,
      connectionPoolService,
      eventEmitter,
    );

    await apiService.createConnections(network, (endpoint, config) =>
      SolanaApiConnection.create(
        endpoint,
        apiService.fetchBlocksBatches,
        eventEmitter,
        config,
      ),
    );

    return apiService;
  }

  protected metadataMismatchError(
    metadata: string,
    expected: string,
    actual: string,
  ): Error {
    return Error(
      `Value of ${metadata} does not match across all endpoints. Please check that your endpoints are for the same network.\n
       Expected: ${expected}
       Actual: ${actual}`,
    );
  }

  get api(): SolanaApi {
    return this.unsafeApi;
  }

  safeApi(height: number): SolanaSafeApi {
    throw new Error('Not implemented');
  }

  // private async fetchFullBlocksBatch(
  //   api: SolanaApi,
  //   batch: number[],
  // ): Promise<IBlock<SolanaBlock>[]> {
  //   return api.fetchBlocks(batch);
  // }

  // private async fetchLightBlocksBatch(
  //   api: EthereumApi,
  //   batch: number[],
  // ): Promise<IBlock<LightEthereumBlock>[]> {
  //   return api.fetchBlocksLight(batch);
  // }

  // updateBlockFetching(): void {
  //   const fetchFunc = this.fetchFullBlocksBatch.bind(this);

  //   if (this.nodeConfig?.profiler) {
  //     this.fetchBlocksFunction = profilerWrap(
  //       fetchFunc,
  //       'SolanaApiService',
  //       'fetchBlocksBatches',
  //     ) as FetchFunc;
  //   } else {
  //     this.fetchBlocksFunction = fetchFunc;
  //   }
  // }
}
