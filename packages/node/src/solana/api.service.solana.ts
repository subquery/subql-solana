// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import assert from 'assert';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiService,
  ConnectionPoolService,
  getLogger,
  NodeConfig,
  IBlock,
  exitWithError,
  profilerWrap,
} from '@subql/node-core';
import { IEndpointConfig } from '@subql/types-core';
import {
  SolanaNetworkConfig,
  ISolanaEndpointConfig,
  SolanaBlock,
} from '@subql/types-solana';
import { SubqueryProject } from '../configure/SubqueryProject';
import { SolanaApiConnection, FetchFunc, GetFetchFunc } from './api.connection';
import { SolanaApi, SolanaSafeApi } from './api.solana';
import { SolanaDecoder } from './decoder';

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
    connectionPoolService: ConnectionPoolService<SolanaApiConnection>,
    private nodeConfig: NodeConfig,
    eventEmitter: EventEmitter2,
    readonly decoder: SolanaDecoder,
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

    const decoder = new SolanaDecoder();

    const apiService = new SolanaApiService(
      connectionPoolService,
      nodeConfig,
      eventEmitter,
      decoder,
    );

    apiService.updateBlockFetching();

    await apiService.createConnections(network, (endpoint, config) =>
      SolanaApiConnection.create(
        endpoint,
        apiService.fetchBlocksBatches,
        eventEmitter,
        decoder,
        config,
      ),
    );

    return apiService;
  }

  private async fetchFullBlocksBatch(
    api: SolanaApi,
    batch: number[],
  ): Promise<IBlock<SolanaBlock>[]> {
    return api.fetchBlocks(batch);
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
    return this.api.getSafeApi(height);
  }

  private updateBlockFetching() {
    const fetchFunc =
      /*skipTransactions
      ? this.fetchLightBlocksBatch.bind(this)
      : */ this.fetchFullBlocksBatch.bind(this);

    if (this.nodeConfig?.profiler) {
      this.fetchBlocksFunction = profilerWrap(
        fetchFunc,
        'SubstrateUtil',
        'fetchBlocksBatches',
      ) as FetchFunc;
    } else {
      this.fetchBlocksFunction = fetchFunc;
    }
  }
}
