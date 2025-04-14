// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import http from 'http';
import https from 'https';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { assertIsAddress } from '@solana/addresses';
import { createSolanaRpc, Rpc } from '@solana/kit';
import { SolanaRpcApi } from '@solana/rpc-api';
import { getLogger, Header, IBlock } from '@subql/node-core';
import { SolanaBlock, ISolanaEndpointConfig } from '@subql/types-solana';
import CacheableLookup from 'cacheable-lookup';
import {
  formatBlockUtil,
  solanaBlockToHeader,
  transformBlock,
} from './block.solana';
import { SolanaDecoder } from './decoder';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: packageVersion } = require('../../package.json');

const logger = getLogger('api.ethereum');

export type SolanaSafeApi = undefined;

function getHttpAgents() {
  // By default Nodejs doesn't cache DNS lookups
  // https://httptoolkit.com/blog/configuring-nodejs-dns/
  const lookup = new CacheableLookup();

  const options: http.AgentOptions = {
    keepAlive: true,
    /*, maxSockets: 100*/
  };

  const httpAgent = new http.Agent(options);
  const httpsAgent = new https.Agent(options);

  lookup.install(httpAgent);
  lookup.install(httpsAgent);

  return {
    http: httpAgent,
    https: httpsAgent,
  };
}

export class SolanaApi {
  #client: Rpc<SolanaRpcApi>;

  // This is used within the sandbox when HTTP is used
  #genesisBlockHash: string;
  readonly decoder: SolanaDecoder;

  /**
   * @param {string} endpoint - The endpoint of the RPC provider
   * @param {number} blockConfirmations - Used to determine how many blocks behind the head a block is considered finalized. Not used if the network has a concrete finalization mechanism.
   * @param {object} eventEmitter - Used to monitor the number of RPC requests
   */
  private constructor(
    client: Rpc<SolanaRpcApi>,
    genesisHash: string,
    private endpoint: string,
    private eventEmitter: EventEmitter2,
  ) {
    this.#client = client;
    this.#genesisBlockHash = genesisHash;

    this.decoder = new SolanaDecoder(this);
  }

  static async create(
    endpoint: string,
    eventEmitter: EventEmitter2,
    config?: ISolanaEndpointConfig,
  ): Promise<SolanaApi> {
    try {
      // TODO keep alive, user agent and other headers
      const client = createSolanaRpc(endpoint);
      const genesisBlockHash = await client
        .getGenesisHash()
        .send()
        .catch((e) => {
          throw new Error('Failed to get genesis hash', { cause: e });
        });

      return new SolanaApi(client, genesisBlockHash, endpoint, eventEmitter);
    } catch (e) {
      console.error('CrateSoalana API', e);
      throw e;
    }
  }

  async getFinalizedBlockHeader(): Promise<Header> {
    try {
      const height = await this.#client
        .getSlot({ commitment: 'finalized' })
        .send();

      // Request the minimal amount of information here
      const block = await this.#client
        .getBlock(height, {
          encoding: 'json',
          transactionDetails: 'none',
          rewards: false,
        })
        .send();

      if (!block) {
        throw new Error('Unable to get finalized block');
      }

      return solanaBlockToHeader(block);
    } catch (e) {
      throw new Error('Failed to get finalized header', { cause: e });
    }
  }

  async getFinalizedBlockHeight(): Promise<number> {
    try {
      const finalizedHeight = await this.#client
        .getSlot({ commitment: 'finalized' })
        .send();

      return Number(finalizedHeight);
    } catch (e) {
      throw new Error('Failed to get finalized height', { cause: e });
    }
  }

  async getBestBlockHeight(): Promise<number> {
    try {
      const confirmedHeight = await this.#client
        .getSlot({ commitment: 'confirmed' })
        .send();

      return Number(confirmedHeight);
    } catch (e) {
      throw new Error('Failed to get best height', { cause: e });
    }
  }

  getRuntimeChain(): string {
    switch (this.#genesisBlockHash) {
      case '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':
        return 'mainnet';
      case 'EKLxEB4xoEDq9AAn5HhFiP5WqdhNVc4An2HvJyzHzx7u': // Not tested
        return 'testnet;';
      case 'GH7ome3EiwEr7tu9JuTh2dpYWBJK3z69Xm1ZE3MEE6JC':
        return 'devnet';
      default:
        return 'unknown';
    }
  }

  getGenesisHash(): string {
    return this.#genesisBlockHash;
  }

  getSpecName(): string {
    return 'solana';
  }

  async getHeaderByHeightOrHash(
    heightOrHash: number | string,
  ): Promise<Header> {
    console.log('GET HEADER', heightOrHash);
    // if (typeof heightOrHash === 'number') {
    //   heightOrHash = hexValue(heightOrHash);
    // }
    if (typeof heightOrHash === 'string') {
      throw new Error('Hash not supported'); // TODO find a workaround
    }
    const block = await this.#client.getBlock(BigInt(heightOrHash)).send();

    if (!block) {
      throw new Error(`Unable to get block: ${heightOrHash}`);
    }

    return solanaBlockToHeader(block);
  }

  async fetchBlock(blockNumber: number): Promise<IBlock<SolanaBlock>> {
    try {
      const rawBlock = await this.#client
        .getBlock(BigInt(blockNumber), {
          encoding: 'json',
          transactionDetails: 'full',
          maxSupportedTransactionVersion: 0,
        })
        .send();

      if (!rawBlock) {
        // TODO could get
        throw new Error(`Unable to get block at slot ${blockNumber}`);
      }

      this.eventEmitter.emit('fetchBlock');
      return formatBlockUtil(transformBlock(rawBlock, this.decoder));
    } catch (e: any) {
      throw this.handleError(e);
    }
  }

  async fetchBlocks(bufferBlocks: number[]): Promise<IBlock<SolanaBlock>[]> {
    return Promise.all(bufferBlocks.map(async (num) => this.fetchBlock(num)));
  }

  get api(): Rpc<SolanaRpcApi> {
    return this.#client;
  }

  getSafeApi(blockHeight: number): SolanaSafeApi {
    return;
    // throw new Error('Safe Api is not supported');
  }

  // This method is designed to be compatible with @solana/web3.js so that @coral-xyz/anchor IDLs can be fetched.
  async getAccountInfo(address: unknown): Promise<{ data: Buffer } | null> {
    const addressStr =
      typeof address === 'string' ? address : (address as any).toBase58();
    assertIsAddress(addressStr);

    const res = await this.#client
      .getAccountInfo(addressStr, {
        encoding: 'base64',
      })
      .send();

    if (res.value) {
      return {
        data: Buffer.from(res.value.data[0], 'base64'),
      };
    }

    return null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async connect(): Promise<void> {
    logger.error('Ethereum API connect is not implemented');
    throw new Error('Not implemented: connect');
  }

  async disconnect(): Promise<void> {
    // NO-OP
    // TODO implement if websockets are supported
    // if (this.client instanceof WebSocketProvider) {
    //   await this.client.destroy();
    // } else {
    //   logger.warn('Disconnect called on HTTP provider');
    // }
  }

  handleError(e: Error): Error {
    if ((e as any)?.context?.statusCode === 429) {
      const { hostname } = new URL(this.endpoint);
      console.log('ERROR', e);
      return new Error(`Rate Limited at endpoint: ${hostname}`);
    }

    return e;
  }
}
