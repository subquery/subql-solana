// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import { BlockHeightMap, NodeConfig } from '@subql/node-core';
import {
  SolanaDatasourceKind,
  SolanaHandlerKind,
  SubqlDatasource,
  SubqlRuntimeDatasource,
} from '@subql/types-solana';
import { SubqueryProject } from '../../../configure/SubqueryProject';
import { SolanaApi } from '../../../solana';
import { SolanaDictionaryV2 } from './solanaDictionaryV2';

const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

const DEFAULT_DICTIONARY = 'http://localhost:8080';

// import { NOT_NULL_FILTER } from '@subql/common-solana';
// import {
//   BlockHeightMap,
//   DictionaryResponse,
//   IBlock,
//   NodeConfig,
// } from '@subql/node-core';
// import {
//   SolanaBlock,
//   SolanaDatasourceKind,
//   SolanaHandlerKind,
//   SubqlDatasource,
//   SubqlRuntimeDatasource,
// } from '@subql/types-solana';
// import EventEmitter2 from 'eventemitter2';
// import {
//   SolanaProjectDs,
//   SolanaProjectDsTemplate,
//   SubqueryProject,
// } from '../../../configure/SubqueryProject';
// import {
//   buildDictionaryV2QueryEntry,
//   SolanaDictionaryV2,
// } from './solanaDictionaryV2';

// const HTTP_ENDPOINT = 'https://ethereum.rpc.subquery.network/public';
// const mockDs: SolanaProjectDs[] = [
//   {
//     kind: SolanaDatasourceKind.Runtime,
//     assets: new Map(),
//     startBlock: 19217803,
//     mapping: {
//       file: './dist/index.js',
//       handlers: [
//         {
//           handler: 'handleTransaction',
//           kind: SolanaHandlerKind.Transaction,
//           filter: {
//             function: 'approve(address spender, uint256 rawAmount)',
//           },
//         },
//         {
//           handler: 'handleLog',
//           kind: SolanaHandlerKind.Instruction,
//           filter: {
//             topics: [
//               'Transfer(address indexed from, address indexed to, uint256 amount)',
//             ],
//           },
//         },
//         {
//           handler: 'handleLog',
//           kind: SolanaHandlerKind.Log,
//           filter: {
//             topics: [
//               'Transfer(address indexed from, address indexed to, uint256 amount)',
//             ],
//           },
//         },
//       ],
//     },
//   },
// ];

// const templateTs: SolanaProjectDsTemplate = {
//   name: 'template',
//   kind: SolanaDatasourceKind.Runtime,
//   assets: new Map(),
//   options: {
//     abi: 'erc20',
//     // address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
//   },
//   // startBlock: 1,
//   mapping: {
//     file: '',
//     handlers: [
//       {
//         handler: 'handleLog',
//         kind: SolanaHandlerKind.Log,
//         filter: {
//           topics: ['Transfer(address, address, uint256)'],
//         },
//       },
//     ],
//   },
// };

// // tx to is null
// const mockDs2: SolanaProjectDs[] = [
//   {
//     kind: SolanaDatasourceKind.Runtime,
//     assets: new Map(),
//     startBlock: 19217803,
//     mapping: {
//       file: './dist/index.js',
//       handlers: [
//         {
//           handler: 'handleTransaction',
//           kind: SolanaHandlerKind.Transaction,
//           filter: {
//             to: null,
//           },
//         },
//       ],
//     },
//     processor: { file: '' },
//   },
// ];

const nodeConfig = new NodeConfig({
  subquery: 'solana-starter',
  subqueryName: 'solana-starter',
  dictionaryTimeout: 10,
  networkEndpoint: { [HTTP_ENDPOINT]: {} },
  networkDictionary: [DEFAULT_DICTIONARY],
});

function makeBlockHeightMap(mockDs: SubqlDatasource[]): BlockHeightMap<any> {
  const m = new Map<number, any>();
  mockDs.forEach((ds, index, dataSources) => {
    m.set(ds.startBlock || 1, dataSources.slice(0, index + 1));
  });
  return new BlockHeightMap(m);
}

// // enable this once dictionary v2 is online
describe('solana dictionary v2', () => {
  let solanaDictionaryV2: SolanaDictionaryV2;

  //   const dsMap = makeBlockHeightMap(mockDs);

  beforeAll(async () => {
    solanaDictionaryV2 = await SolanaDictionaryV2.create(
      DEFAULT_DICTIONARY,
      nodeConfig,
      { network: { chainId: '1' } } as SubqueryProject,
      await SolanaApi.create(HTTP_ENDPOINT, new EventEmitter2()),
    );
  }, 10000);

  //   beforeEach(() => {
  //     solanaDictionaryV2.updateQueriesMap(dsMap);
  //   });

  //   it('converts ds to v2 dictionary queries', () => {
  //     const query = (solanaDictionaryV2 as any).queriesMap.get(19217803);
  //     expect(query.logs.length).toBe(1);
  //     expect(query.transactions.length).toBe(1);
  //   });

  //   it('query response match with entries', async () => {
  //     const ethBlocks = (await solanaDictionaryV2.getData(
  //       19217803,
  //       (solanaDictionaryV2 as any)._metadata.end,
  //       2,
  //     )) as DictionaryResponse<IBlock<SolanaBlock>>;

  //     expect(ethBlocks.batchBlocks.map((b) => b.block.number)).toStrictEqual([
  //       19217803, 19217804,
  //     ]);

  //     const ethBlock19217803 = ethBlocks.batchBlocks[0].block;
  //     const ethBlock19217804 = ethBlocks.batchBlocks[1].block;

  //     expect(ethBlock19217803.number).toBe(19217803);
  //     expect(ethBlock19217804.number).toBe(19217804);

  //     // Sighash of approval tx
  //     expect(
  //       ethBlock19217803.transactions.filter(
  //         (tx) => tx.input.indexOf('0x095ea7b3') === 0,
  //       ).length,
  //     ).toBe(4);

  //     expect(ethBlock19217804.logs.length).toBe(233);

  //     // This matches with dictionaryQueryEntries[0].topics
  //     expect(ethBlock19217804.logs[0].topics).toContain(
  //       '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  //     );
  //   }, 10000);

  //   // Geth currently throwing errors with this request
  //   it.skip('is able to get transaction with field to is null', async () => {
  //     const dsMap = makeBlockHeightMap(mockDs2);
  //     solanaDictionaryV2.updateQueriesMap(dsMap);

  //     const { conditions } = (solanaDictionaryV2 as any).getQueryConditions(
  //       19217803,
  //       (solanaDictionaryV2 as any)._metadata.end,
  //     );

  //     expect(conditions).toEqual({ transactions: [{ to: [null] }] });

  //     const ethBlocks = (await solanaDictionaryV2.getData(
  //       19217803,
  //       (solanaDictionaryV2 as any)._metadata.end,
  //       1,
  //     )) as DictionaryResponse<IBlock<SolanaBlock>>;

  //     const { hash, transactions } = ethBlocks.batchBlocks[0].block;

  //     expect(hash).toBe(
  //       '0xa9ba70126240a8418739a103527860948a2be32de2eb9a8f590591faa174c08b',
  //     );

  //     // https://etherscan.io/tx/0x57e8cd9483cb5d308151372b0cf33fdc615999283c80ee3c28e94f074dda61f1
  //     expect(
  //       transactions.find(
  //         (tx) =>
  //           tx.hash ===
  //           '0x57e8cd9483cb5d308151372b0cf33fdc615999283c80ee3c28e94f074dda61f1',
  //       ),
  //     ).toBeDefined();
  //   });

  //   it('is able to query with not null topics', async () => {
  //     /**
  //      * Dictionary v1 supported filtering logs where a topic was null or not null.
  //      * V2 doesn't yet support this but we should still be able to make a dictionary query that gets relevant logs.
  //      * It will just include events that will be filtered out later.
  //      * */

  //     const ds: SubqlRuntimeDatasource = {
  //       kind: SolanaDatasourceKind.Runtime,
  //       assets: new Map(),
  //       options: {
  //         abi: 'erc20',
  //       },
  //       startBlock: 19476187,
  //       mapping: {
  //         file: '',
  //         handlers: [
  //           {
  //             handler: 'handleLog',
  //             kind: SolanaHandlerKind.Log,
  //             filter: {
  //               topics: [
  //                 'Transfer(address, address, uint256)',
  //                 undefined,
  //                 undefined,
  //                 NOT_NULL_FILTER,
  //               ],
  //             },
  //           },
  //         ],
  //       },
  //     };

  //     const dsMap = makeBlockHeightMap([ds]);
  //     solanaDictionaryV2.updateQueriesMap(dsMap);

  //     const { conditions } = (solanaDictionaryV2 as any).getQueryConditions(
  //       19476187,
  //       (solanaDictionaryV2 as any)._metadata.end,
  //     );

  //     expect(conditions).toEqual({
  //       logs: [
  //         {
  //           address: [],
  //           topics0: [
  //             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  //           ],
  //           topics3: [],
  //         },
  //       ],
  //     });

  //     const ethBlocks = (await solanaDictionaryV2.getData(
  //       19476187,
  //       (solanaDictionaryV2 as any)._metadata.end,
  //       2,
  //     )) as DictionaryResponse<IBlock<SolanaBlock>>;

  //     const { hash, logs } = ethBlocks.batchBlocks[0].block;

  //     expect(hash).toEqual(
  //       '0xa798861151ed58ad67d80d1cf61dc30e65d003bc958e99a7969a05a67e69e0b2',
  //     );

  //     const log = logs.find((l) => l.logIndex === 184);
  //     expect(log).toBeDefined();
  //     expect(log!.transactionHash).toEqual(
  //       '0x5491f3f4b7ca6cc81f992a17e19bc9bafff408518c643c5a254de44b5a7b6d72',
  //     );

  //     // Uncomment this when not null filter supported
  //     // expect(logs.filter(l => !l.topics[3]).length).toEqual(6) // There are 6 events with no topic3
  //   }, 100000);

  it('returns a lastBufferedHeight if there are no block results', async () => {
    const blockHeight = 317_617_480;
    const ds: SubqlRuntimeDatasource = {
      kind: SolanaDatasourceKind.Runtime,
      startBlock: blockHeight,
      mapping: {
        file: '',
        handlers: [
          {
            handler: 'handleInstruction',
            kind: SolanaHandlerKind.Instruction,
            filter: {
              programId: '8A2ap8YTUmCYbQztNZQnebE333PBuWQxztYNpvQ8RXKX',
            },
          },
        ],
      },
    };

    const dsMap = makeBlockHeightMap([ds]);
    solanaDictionaryV2.updateQueriesMap(dsMap);

    const res = await solanaDictionaryV2.getData(blockHeight, blockHeight, 100);

    expect(res?.batchBlocks.length).toEqual(0);
    expect(res?.lastBufferedHeight).toEqual(blockHeight);
  });
});

// describe('buildDictionaryV2QueryEntry', () => {
//   it('Build filter for !null', () => {
//     const ds: SubqlRuntimeDatasource = {
//       kind: SolanaDatasourceKind.Runtime,
//       assets: new Map(),
//       options: {
//         abi: 'erc20',
//         address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
//       },
//       startBlock: 1,
//       mapping: {
//         file: '',
//         handlers: [
//           {
//             handler: 'handleLog',
//             kind: SolanaHandlerKind.Log,
//             filter: {
//               topics: [
//                 'Transfer(address, address, uint256)',
//                 undefined,
//                 undefined,
//                 NOT_NULL_FILTER,
//               ],
//             },
//           },
//         ],
//       },
//     };
//     const result = buildDictionaryV2QueryEntry([ds]);

//     expect(result).toEqual({
//       logs: [
//         {
//           address: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//           topics0: [
//             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
//           ],
//           topics3: [],
//         },
//       ],
//     });
//   });

//   it('Build filter tx filter', () => {
//     const ds: SubqlRuntimeDatasource = {
//       kind: SolanaDatasourceKind.Runtime,
//       assets: new Map(),
//       options: {
//         abi: 'erc20',
//         address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
//       },
//       startBlock: 1,
//       mapping: {
//         file: '',
//         handlers: [
//           {
//             handler: 'handleTx',
//             kind: SolanaHandlerKind.Log,
//             filter: {
//               function: 'setminimumStakingAmount(uint256 amount)',
//             },
//           },
//         ],
//       },
//     };
//     const result = buildDictionaryV2QueryEntry([ds]);

//     expect(result).toEqual({
//       transactions: [
//         {
//           to: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//           data: ['0x7ef9ea98'],
//         },
//       ],
//     });
//   });

//   it('Creates a valid filter with a single event handler that has 0 filters but a contract address', () => {
//     const ds: SubqlRuntimeDatasource = {
//       kind: SolanaDatasourceKind.Runtime,
//       assets: new Map(),
//       options: {
//         abi: 'erc20',
//         address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
//       },
//       startBlock: 1,
//       mapping: {
//         file: '',
//         handlers: [
//           {
//             handler: 'handleTransfer',
//             kind: SolanaHandlerKind.Log,
//           },
//           {
//             handler: 'handleTransfer',
//             kind: SolanaHandlerKind.Transaction,
//           },
//         ],
//       },
//     };
//     const result = buildDictionaryV2QueryEntry([ds]);

//     expect(result).toEqual({
//       transactions: [
//         {
//           to: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//         },
//       ],
//       logs: [
//         {
//           address: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//         },
//       ],
//     });
//   });

//   it('build query entries for multiple ds', () => {
//     const ds: SubqlRuntimeDatasource[] = [
//       {
//         kind: SolanaDatasourceKind.Runtime,
//         startBlock: 3327417,
//         options: {
//           abi: 'EnsRegistry',
//           address: '0x314159265dd8dbb310642f98f50c066173c1259b',
//         },
//         assets: new Map(),
//         mapping: {
//           file: './dist/index.js',
//           handlers: [
//             // one duplicate one
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleTransferOldRegistry',
//               filter: {
//                 topics: ['Transfer(bytes32,address)'],
//               },
//             },
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleTransferOldRegistry',
//               filter: {
//                 topics: ['Transfer(bytes32,address)'],
//               },
//             },
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleNewOwnerOldRegistry',
//               filter: {
//                 topics: ['NewOwner(bytes32,bytes32,address)'],
//               },
//             },
//           ],
//         },
//       },
//       {
//         kind: SolanaDatasourceKind.Runtime,
//         startBlock: 3327417,
//         options: {
//           abi: 'Resolver',
//         },
//         assets: new Map(),
//         mapping: {
//           file: './dist/index.js',
//           handlers: [
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleABIChanged',
//               filter: {
//                 topics: ['ABIChanged(bytes32,uint256)'],
//               },
//             },
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleAddrChanged',
//               filter: {
//                 topics: ['AddrChanged(bytes32,address)'],
//               },
//             },
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleMulticoinAddrChanged',
//               filter: {
//                 topics: ['AddressChanged(bytes32,uint256,bytes)'],
//               },
//             },
//             {
//               kind: SolanaHandlerKind.Log,
//               handler: 'handleAuthorisationChanged',
//               filter: {
//                 topics: ['AuthorisationChanged(bytes32,address,address,bool)'],
//               },
//             },
//           ],
//         },
//       },
//     ];

//     const queryEntry = buildDictionaryV2QueryEntry(ds);
//     // Total 7 handlers were given, 1 is duplicate
//     expect(queryEntry.logs!.length).toBe(6);
//   });

//   it('should unique QueryEntry for duplicate dataSources', () => {
//     const ds: SubqlRuntimeDatasource = {
//       kind: SolanaDatasourceKind.Runtime,
//       assets: new Map(),
//       options: {
//         abi: 'erc20',
//         address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
//       },
//       startBlock: 1,
//       mapping: {
//         file: '',
//         handlers: [
//           {
//             handler: 'handleLog',
//             kind: SolanaHandlerKind.Log,
//             filter: {
//               topics: ['Transfer(address, address, uint256)'],
//             },
//           },
//           {
//             handler: 'handleLogSame',
//             kind: SolanaHandlerKind.Log,
//             filter: {
//               topics: ['Transfer(address, address, uint256)'],
//             },
//           },
//           {
//             handler: 'handleTx',
//             kind: SolanaHandlerKind.Transaction,
//             filter: {
//               function: 'setminimumStakingAmount(uint256 amount)',
//               from: 'mockAddress',
//             },
//           },
//           {
//             handler: 'handleTxSame',
//             kind: SolanaHandlerKind.Transaction,
//             filter: {
//               function: 'setminimumStakingAmount(uint256 amount)',
//               from: 'mockAddress',
//             },
//           },
//         ],
//       },
//     };
//     const result = buildDictionaryV2QueryEntry([ds]);

//     expect(result).toEqual({
//       logs: [
//         {
//           address: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//           topics0: [
//             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
//           ],
//         },
//       ],
//       transactions: [
//         {
//           from: ['mockaddress'],
//           to: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//           data: ['0x7ef9ea98'],
//         },
//       ],
//     });
//   });

//   it('should group a small number of dynamic ds', () => {
//     const ds: SubqlRuntimeDatasource[] = [];

//     for (let i = 0; i < 10; i++) {
//       // Bad nodejs types
//       const tmp = (global as any).structuredClone(templateTs);
//       (tmp.options.address = `0x${i}`), ds.push(tmp);
//     }

//     const result = buildDictionaryV2QueryEntry(ds);

//     expect(result).toEqual({
//       logs: [
//         {
//           address: [
//             '0x0',
//             '0x1',
//             '0x2',
//             '0x3',
//             '0x4',
//             '0x5',
//             '0x6',
//             '0x7',
//             '0x8',
//             '0x9',
//           ],
//           topics0: [
//             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
//           ],
//         },
//       ],
//     });
//   });

//   it('should remove address filter with large number of dynamic ds', () => {
//     const ds: SubqlRuntimeDatasource[] = [];

//     for (let i = 0; i < 200; i++) {
//       // Bad nodejs types
//       const tmp = (global as any).structuredClone(templateTs);
//       (tmp.options.address = `0x${i}`), ds.push(tmp);
//     }

//     const result = buildDictionaryV2QueryEntry(ds);

//     expect(result).toEqual({
//       logs: [
//         {
//           address: [],
//           topics0: [
//             '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
//           ],
//         },
//       ],
//     });
//   });

//   it('builds a filter when theres a block handler with modulo filter', () => {
//     const ds: SubqlRuntimeDatasource = {
//       kind: SolanaDatasourceKind.Runtime,
//       assets: new Map(),
//       options: {
//         abi: 'erc20',
//         address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
//       },
//       startBlock: 1,
//       mapping: {
//         file: '',
//         handlers: [
//           {
//             handler: 'handleBlock',
//             kind: SolanaHandlerKind.Block,
//             filter: {
//               modulo: 100,
//             },
//           },
//           {
//             handler: 'handleTx',
//             kind: SolanaHandlerKind.Transaction,
//             filter: {
//               function: 'setminimumStakingAmount(uint256 amount)',
//             },
//           },
//         ],
//       },
//     };
//     const result = buildDictionaryV2QueryEntry([ds]);

//     expect(result).toEqual({
//       transactions: [
//         {
//           to: ['0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'],
//           data: ['0x7ef9ea98'],
//         },
//       ],
//     });
//   });
// });
