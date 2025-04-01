// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import http from 'http';
import https from 'https';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { assertIsAddress } from '@solana/addresses';
import { createSolanaRpc, Rpc } from '@solana/kit';
import { SolanaRpcApi } from '@solana/rpc-api';
import { getLogger, Header, IBlock } from '@subql/node-core';
import {
  SolanaBlock,
  ISolanaEndpointConfig,
} from '@subql/types-solana';
import CacheableLookup from 'cacheable-lookup';
import {
  formatBlockUtil,
  solanaBlockToHeader,
  transformBlock,
} from './block.solana';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: packageVersion } = require('../../package.json');

const logger = getLogger('api.ethereum');

export type SolanaSafeApi = never;


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
  private chainId?: number;
  private name?: string;

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
  }

  static async create(
    endpoint: string,
    eventEmitter: EventEmitter2,
    config?: ISolanaEndpointConfig,
  ): Promise<SolanaApi> {
    try {

      // TODO keep alive, user agent and other headers
      const client = createSolanaRpc(endpoint);
      const genesisBlockHash = await client.getGenesisHash().send();

      return new SolanaApi(
        client,
        genesisBlockHash,
        endpoint,
        eventEmitter,
      );
    } catch (e) {
      console.error('CrateSoalana API', e)
      throw e;
    }
  }

  async getFinalizedBlockHeader(): Promise<Header> {

    const height = await this.#client.getBlockHeight({ commitment: 'finalized' }).send();

    // Request the minimal amount of information here
    const block = await this.#client.getBlock(height, {
      encoding: 'json',
      transactionDetails: 'none',
      rewards: false
    }).send();

    if (!block) {
      throw new Error('Unable to get finalized block');
    }

    return solanaBlockToHeader(block);
  }

  async getFinalizedBlockHeight(): Promise<number> {
    const finalizedHeight = await this.#client.getBlockHeight({ commitment: 'finalized' }).send();

    return Number(finalizedHeight);
  }

  async getBestBlockHeight(): Promise<number> {
    const confirmedHeight = await this.#client.getBlockHeight({ commitment: 'confirmed' }).send();

    return Number(confirmedHeight);
  }

  getRuntimeChain(): string {
    switch (this.#genesisBlockHash) {
      case '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':
        return 'mainnet';
      case 'EKLxEB4xoEDq9AAn5HhFiP5WqdhNVc4An2HvJyzHzx7u': // Not tested
        return 'testnet;'
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

  async getHeaderByHeightOrHash(heightOrHash: number | string): Promise<Header> {
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
      const rawBlock = await this.#client.getBlock(
        BigInt(blockNumber),
        { encoding: "json", transactionDetails: 'full', maxSupportedTransactionVersion: 0 }
      ).send();

      if (!rawBlock) {
        // TODO could get
        throw new Error(`Unable to get block at slot ${blockNumber}`);
      }

      this.eventEmitter.emit('fetchBlock');
      return formatBlockUtil(transformBlock(rawBlock));
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
    throw new Error('Safe Api is not supported')
  }

  // This method is designed to be compatible with @solana/web3.js so that @coral-xyz/anchor IDLs can be fetched.
  async getAccountInfo(address: unknown): Promise<{ data: Buffer } | null> {
    const addressStr = typeof address === 'string' ? address : (address as any).toBase58();
    assertIsAddress(addressStr);

    const res = await this.#client.getAccountInfo(addressStr, {
      encoding: 'base64',
    }).send();

    if (res.value) {
      return {
        data: Buffer.from(res.value.data[0], 'base64'),
      };
    }

    return null;
  }

  // private buildInterface(
  //   abiName: string,
  //   assets: Record<string, string>,
  // ): Interface {
  //   if (!assets[abiName]) {
  //     throw new Error(`ABI named "${abiName}" not referenced in assets`);
  //   }

  //   // This assumes that all datasources have a different abi name or they are the same abi
  //   if (!this.contractInterfaces[abiName]) {
  //     // Constructing the interface validates the ABI
  //     try {
  //       let abiObj = JSON.parse(assets[abiName]);

  //       /*
  //        * Allows parsing JSON artifacts as well as ABIs
  //        * https://trufflesuite.github.io/artifact-updates/background.html#what-are-artifacts
  //        */
  //       if (!Array.isArray(abiObj) && abiObj.abi) {
  //         abiObj = abiObj.abi;
  //       }

  //       this.contractInterfaces[abiName] = new Interface(abiObj);
  //     } catch (e: any) {
  //       logger.error(`Unable to parse ABI: ${e.message}`);
  //       throw new Error('ABI is invalid');
  //     }
  //   }

  //   return this.contractInterfaces[abiName];
  // }

  // async parseLog<T extends EthereumResult = EthereumResult>(
  //   log: EthereumLog | LightEthereumLog,
  //   ds: SubqlRuntimeDatasource,
  // ): Promise<
  //   EthereumLog | LightEthereumLog | EthereumLog<T> | LightEthereumLog<T>
  // > {
  //   try {
  //     if (!ds?.options?.abi) {
  //       logger.warn('No ABI provided for datasource');
  //       return log;
  //     }
  //     const iface = this.buildInterface(ds.options.abi, await loadAssets(ds));

  //     log.args = iface?.parseLog(log).args as T;

  //     return log;
  //   } catch (e: any) {
  //     logger.warn(`Failed to parse log data: ${e.message}`);
  //     return log;
  //   }
  // }

  // async parseTransaction<T extends EthereumResult = EthereumResult>(
  //   transaction: SolanaTransaction,
  //   ds: SubqlRuntimeDatasource,
  // ): Promise<SolanaTransaction<T> | SolanaTransaction> {
  //   try {
  //     if (!ds?.options?.abi) {
  //       if (transaction.input !== '0x') {
  //         logger.warn('No ABI provided for datasource');
  //       }
  //       return transaction;
  //     }
  //     const assets = await loadAssets(ds);
  //     const iface = this.buildInterface(ds.options.abi, assets);
  //     const func = iface.getFunction(hexDataSlice(transaction.input, 0, 4));
  //     const args = iface.decodeFunctionData(func, transaction.input) as T;

  //     transaction.logs =
  //       transaction.logs &&
  //       ((await Promise.all(
  //         transaction.logs.map(async (log) => this.parseLog(log, ds)),
  //       )) as Array<EthereumLog | EthereumLog<T>>);

  //     transaction.args = args;
  //     return transaction;
  //   } catch (e: any) {
  //     logger.warn(`Failed to parse transaction data: ${e.message}`);
  //     return transaction;
  //   }
  // }

  // eslint-disable-next-line @typescript-eslint/require-await
  async connect(): Promise<void> {
    logger.error('Ethereum API connect is not implemented');
    throw new Error('Not implemented');
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
    if ((e as any)?.status === 429) {
      const { hostname } = new URL(this.endpoint);
      return new Error(`Rate Limited at endpoint: ${hostname}`);
    }

    return e;
  }
}
