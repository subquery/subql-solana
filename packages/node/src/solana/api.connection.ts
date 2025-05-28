// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiConnectionError,
  ApiErrorType,
  DisconnectionError,
  LargeResponseError,
  NetworkMetadataPayload,
  RateLimitError,
  TimeoutError,
  IApiConnectionSpecific,
  IBlock,
} from '@subql/node-core';
import { ISolanaEndpointConfig, SolanaBlock } from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';

export type FetchFunc = (
  api: SolanaApi,
  batch: number[],
) => Promise<IBlock<SolanaBlock>[]>;

// We use a function to get the fetch function because it can change depending on the skipBlocks feature
export type GetFetchFunc = () => FetchFunc;

export class SolanaApiConnection
  implements IApiConnectionSpecific<SolanaApi, never, IBlock<SolanaBlock>[]>
{
  readonly networkMeta: NetworkMetadataPayload;

  private constructor(
    public unsafeApi: SolanaApi,
    private fetchBlocksBatches: GetFetchFunc,
  ) {
    this.networkMeta = {
      chain: unsafeApi.getGenesisHash(),
      specName: unsafeApi.getSpecName(),
      genesisHash: unsafeApi.getGenesisHash(),
    };
  }

  static async create(
    endpoint: string,
    fetchBlocksBatches: GetFetchFunc,
    eventEmitter: EventEmitter2,
    decoder: SolanaDecoder,
    config?: ISolanaEndpointConfig,
  ): Promise<SolanaApiConnection> {
    const api = await SolanaApi.create(endpoint, eventEmitter, decoder, config);

    return new SolanaApiConnection(api, fetchBlocksBatches);
  }

  safeApi(height: number): never {
    throw new Error(`Not Implemented: safeApi`);
  }

  async apiConnect(): Promise<void> {
    await this.unsafeApi.connect();
  }

  async apiDisconnect(): Promise<void> {
    await this.unsafeApi.disconnect();
  }

  async fetchBlocks(heights: number[]): Promise<IBlock<SolanaBlock>[]> {
    const blocks = await this.fetchBlocksBatches()(this.unsafeApi, heights);
    return blocks;
  }

  handleError = SolanaApiConnection.handleError;

  static handleError(e: Error): ApiConnectionError {
    let formatted_error: ApiConnectionError;
    if (e.message.startsWith('The operation was aborted due to timeout')) {
      formatted_error = new TimeoutError(e);
      //} else if (e.message.startsWith(`disconnected from `)) {
      //   formatted_error = new DisconnectionError(e);
    } else if (e.message.startsWith(`Rate Limited at endpoint`)) {
      formatted_error = new RateLimitError(e);
      // } else if (e.message.includes(`Exceeded max limit of`)) {
      //   formatted_error = new LargeResponseError(e);
    } else {
      formatted_error = new ApiConnectionError(
        e.name,
        e.message,
        ApiErrorType.Default,
      );
    }
    return formatted_error;
  }
}
