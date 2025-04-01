// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import path from 'path';
import { translateAddress } from '@coral-xyz/anchor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Connection } from '@solana/web3.js';
import { TransactionFilter } from '@subql/common-solana';
import {
  SolanaBlock,
  SolanaBlockFilter,
  SolanaDatasourceKind,
  SolanaHandlerKind,
  SolanaLogFilter,
  SubqlRuntimeDatasource,
} from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import { filterBlocksProcessor, filterInstructionsProcessor, filterTransactionsProcessor } from './utils.solana';

// Add api key to work
const HTTP_ENDPOINT = process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

const ds: SubqlRuntimeDatasource = {
  mapping: {
    file: '',
    handlers: [
      {
        handler: 'test',
        kind: SolanaHandlerKind.Transaction,
        filter: { /*function: '0x23b872dd'*/ },
      },
    ],
  },
  kind: SolanaDatasourceKind.Runtime,
  startBlock: 16258633,
  options: { abi: 'erc721' },
  assets: new Map([
    ['erc721', { file: path.join(__dirname, '../../test/erc721.json') }],
  ]),
};

jest.setTimeout(90000);
describe('Api.solana', () => {
  let solanaApi: SolanaApi;
  const eventEmitter = new EventEmitter2();
  let blockData: SolanaBlock;

  const fetchBlock = async (height: number) => {
    const block = await solanaApi.fetchBlock(height);

    return block.block as SolanaBlock;
  };

  beforeAll(async () => {
    solanaApi = await SolanaApi.create(HTTP_ENDPOINT, eventEmitter);
    //https://solscan.io/block/325922873
    blockData = await fetchBlock(325_922_873);
  });

  it('Should run block filters correctly', () => {

    const moduloBlockFilter: SolanaBlockFilter = {
      modulo: 1
    }
    expect(filterBlocksProcessor(blockData, moduloBlockFilter)).toBeTruthy();

    const moduloBlockFilter2: SolanaBlockFilter = {
      modulo: 325_922_870
    }
    expect(filterBlocksProcessor(blockData, moduloBlockFilter2)).toBeFalsy();

    // TODO timestamp block filter
  });

  it('Should run transaction filters correctly', () => {
    // https://solscan.io/tx/FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY
    const tx = blockData.transactions.find(tx => tx.transaction.signatures.find(s => s === 'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY'))
    expect(tx).toBeDefined();

    const signerMatch: TransactionFilter = {
      signerAccountKey: '3j1iDNRseKJVEWAb62Xxn74mVjJ7sUTVJaaBNb3gKtUe'
    };
    expect(filterTransactionsProcessor(tx!, signerMatch)).toBeTruthy();

    const signerMismatch: TransactionFilter = {
      signerAccountKey: '7yYGUXSY9hSa3MqmU7t4acCMBzSQyjxZyoRC1bDKMKJh'
    };
    expect(filterTransactionsProcessor(tx!, signerMismatch)).toBeFalsy();
  });

  it('Should run instruction filters correctly', () => {
    const tx = blockData.transactions.find(tx => tx.transaction.signatures.find(s => s === 'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY'))

    const inst = tx?.transaction.message.instructions[1];

    expect(inst).toBeDefined();

    // A program called by this instruction
    expect(filterInstructionsProcessor(inst, { programId: 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE' })).toBe(true);

    // A program not called by this instruction
    expect(filterInstructionsProcessor(inst, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' })).toBe(false);
  });

  it('has the same behaviour for getAccountInfo as legacy @solana/web3.js', async () => {
    const connection2 = new Connection(HTTP_ENDPOINT);

    const res1 = await solanaApi.getAccountInfo("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE")
    const res2 = await connection2.getAccountInfo(translateAddress("SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE"));
    expect(res1?.data).toEqual(res2?.data);
  });

  // it('Should run instruction filters on an internal instruction correctly', () => [

  // ])

  // it('Should format transaction in logs, and the transaction gas should be bigInt type', () => {
  //   expect(typeof blockData.logs[0].transaction.gas).toBe('bigint');
  //   expect(typeof blockData.logs[0].transaction.blockNumber).toBe('number');
  //   expect(typeof blockData.logs[0].transaction.gasPrice).toBe('bigint');
  //   expect(typeof blockData.logs[0].transaction.maxPriorityFeePerGas).toBe(
  //     'bigint',
  //   );
  //   expect(typeof blockData.logs[0].transaction.transactionIndex).toBe(
  //     'bigint',
  //   );
  // });

  // it('should have the ability to get receipts via transactions from all types', () => {
  //   expect(typeof blockData.transactions[0].receipt).toEqual('function');
  //   expect(typeof blockData.logs[0].transaction.receipt).toEqual('function');
  //   expect(typeof blockData.logs[0].transaction.from).toEqual('string');
  //   expect(typeof blockData.transactions[81].logs![0].transaction.from).toEqual(
  //     'string',
  //   );
  //   expect(
  //     typeof blockData.transactions[81].logs![0].transaction.receipt,
  //   ).toEqual('function');
  // });

  // it('Decode nested logs in transactions', async () => {
  //   // Erc721
  //   const tx = blockData.transactions.find(
  //     (e) =>
  //       e.hash ===
  //       '0x8e419d0e36d7f9c099a001fded516bd168edd9d27b4aec2bcd56ba3b3b955ccc',
  //   );
  //   const parsedTx = await ethApi.parseTransaction(tx!, ds);
  //   expect(parsedTx.logs![0].args).toBeTruthy();
  // });

  // it('Should decode transaction data and not clone object', async () => {
  //   const tx = blockData.transactions.find(
  //     (e) =>
  //       e.hash ===
  //       '0x8e419d0e36d7f9c099a001fded516bd168edd9d27b4aec2bcd56ba3b3b955ccc',
  //   );
  //   const parsedTx = await ethApi.parseTransaction(tx!, ds);

  //   expect(parsedTx).toBe(tx);
  // });

  // it('Should return raw logs, if decode fails', async () => {
  //   // not Erc721
  //   const tx = blockData.transactions.find(
  //     (e) =>
  //       e.hash ===
  //       '0xed62f7a7720fe6ae05dec45ad9dd4f53034a0aae2c140d229b1151504ee9a6c9',
  //   );
  //   const parsedLog = await ethApi.parseLog(tx!.logs![0], ds);
  //   expect(parsedLog).not.toHaveProperty('args');
  //   expect(parsedLog).toBeTruthy();
  // });

  // // This test is here to ensure getters aren't removed
  // it('Should not clone logs when parsing args', async () => {
  //   const log = blockData.transactions.find(
  //     (e) =>
  //       e.hash ===
  //       '0x8e419d0e36d7f9c099a001fded516bd168edd9d27b4aec2bcd56ba3b3b955ccc',
  //   )!.logs![1];

  //   const parsedLog = await ethApi.parseLog(log, ds);
  //   expect(parsedLog).toBe(log);
  // });

  // it('Null filter support', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   blockData = await fetchBlock(2847447);
  //   const result = blockData.transactions.filter((tx) => {
  //     if (
  //       filterTransactionsProcessor(
  //         tx,
  //         { to: null },
  //         '0x72a33394f0652e2bf15d7901f3cd46863d968424',
  //       )
  //     ) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result[0].hash).toBe(
  //     '0x24bef923522a4d6a79f9ab9242a74fb987dce94002c0f107c2a7d0b7e24bcf05',
  //   );
  //   expect(result.length).toBe(1);
  // });

  // it('!null filter support for logs, expect to filter out', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   const filter_1: SolanaLogFilter = {
  //     topics: [
  //       '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  //       undefined,
  //       undefined,
  //       NOT_NULL_FILTER,
  //     ],
  //   };

  //   const filter_2: SolanaLogFilter = {
  //     topics: [
  //       '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  //     ],
  //   };

  //   blockData = await fetchBlock(4015990);
  //   const transaction = blockData.transactions.find(
  //     (tx) =>
  //       tx.hash ===
  //       '0xeb2e443f2d4e784193fa13bbbae2b85e6ee459e7b7b53f8ca098ffae9b25b059',
  //   )!;

  //   const erc20Transfers = transaction.logs!.filter((log) =>
  //     filterLogsProcessor(log, filter_2),
  //   );
  //   const erc721Transfers = transaction.logs!.filter((log) =>
  //     filterLogsProcessor(log, filter_1),
  //   );

  //   expect(erc20Transfers.length).toBe(7);
  //   expect(erc721Transfers.length).toBe(2);
  // });

  // it('Null and 0x (empty) filter support for transaction data', async () => {
  //   const beamEndpoint = 'https://mainnet.base.org/';
  //   ethApi = new EthereumApi(beamEndpoint, BLOCK_CONFIRMATIONS, eventEmitter);
  //   await ethApi.init();
  //   blockData = await fetchBlock(1104962);
  //   // blockData.transactions[0].to = undefined;
  //   const result = blockData.transactions.filter((tx) => {
  //     if (filterTransactionsProcessor(tx, { function: null })) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result.length).toBe(1);
  //   expect(result[0].hash).toBe(
  //     '0x182c5381f8fa3332a7bd676b1c819a15119972db52bd5210afead88f18fff642',
  //   );

  //   const result2 = blockData.transactions.filter((tx) => {
  //     if (filterTransactionsProcessor(tx, { function: '0x' })) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result2.length).toBe(1);
  //   expect(result2[0].hash).toBe(
  //     '0x182c5381f8fa3332a7bd676b1c819a15119972db52bd5210afead88f18fff642',
  //   );
  // });

  // it('Null filter support, for undefined transaction.to', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   blockData = await fetchBlock(2847447);
  //   blockData.transactions[1].to = undefined;
  //   const result = blockData.transactions.filter((tx) => {
  //     if (
  //       filterTransactionsProcessor(
  //         tx,
  //         { to: null },
  //         '0x72a33394f0652e2bf15d7901f3cd46863d968424',
  //       )
  //     ) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result[0].hash).toBe(
  //     '0x24bef923522a4d6a79f9ab9242a74fb987dce94002c0f107c2a7d0b7e24bcf05',
  //   );
  //   expect(result.length).toBe(1);
  // });

  // it('Should return all tx if filter.to is not defined', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   blockData = await fetchBlock(2847447);
  //   const result = blockData.transactions.filter((tx) => {
  //     if (
  //       filterTransactionsProcessor(
  //         tx,
  //         undefined,
  //         '0x72a33394f0652e2bf15d7901f3cd46863d968424',
  //       )
  //     ) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result.length).toBe(2);
  // });

  // it('filter.to Should support only null not undefined', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   blockData = await fetchBlock(2847447);
  //   const result = blockData.transactions.filter((tx) => {
  //     if (
  //       filterTransactionsProcessor(
  //         tx,
  //         { to: undefined },
  //         '0x72a33394f0652e2bf15d7901f3cd46863d968424',
  //       )
  //     ) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result.length).toBe(0);
  // });

  // it('If transaction is undefined, with null filter, should be supported', async () => {
  //   ethApi = new EthereumApi(
  //     MOONBEAM_ENDPOINT,
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();
  //   blockData = await fetchBlock(2847447);
  //   const result = blockData.transactions.filter((tx) => {
  //     tx.to = undefined;
  //     if (
  //       filterTransactionsProcessor(
  //         tx,
  //         { to: null },
  //         '0x72a33394f0652e2bf15d7901f3cd46863d968424',
  //       )
  //     ) {
  //       return tx.hash;
  //     }
  //   });
  //   expect(result.length).toBe(2);
  // });

  // it('Assert blockHash on logs and block', async () => {
  //   ethApi = new EthereumApi(
  //     'https://rpc.ankr.com/xdc',
  //     BLOCK_CONFIRMATIONS,
  //     eventEmitter,
  //   );
  //   await ethApi.init();

  //   const mockBlockNumber = 72194336;
  //   const mockBlockHash = 'mockBlockHash';
  //   const mockIncorrectBlockHash = 'mockIncorrectBlockHash';

  //   jest.spyOn(ethApi as any, 'getBlockPromise').mockResolvedValueOnce({
  //     hash: mockBlockHash,
  //     transactions: [],
  //   });

  //   jest.spyOn((ethApi as any).client, 'getLogs').mockResolvedValueOnce([
  //     {
  //       blockNumber: '0x1831a96',
  //       blockHash: mockIncorrectBlockHash,
  //       transactionHash: 'tx1',
  //       logIndex: '0x0',
  //     },
  //   ]);

  //   await expect(ethApi.fetchBlock(mockBlockNumber)).rejects.toThrow(
  //     `Log BlockHash does not match block: 72194336, blockHash mockBlockHash. Log 0 got block 25369238 blockHash mockIncorrectBlockHash. Please check with rpc provider`,
  //   );
  // });
});
