// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { getDefaultResponseTransformerForSolanaRpc, innerInstructionsConfigs, KEYPATH_WILDCARD, messageConfig } from "@solana/rpc-transformers";
import { NOT_NULL_FILTER } from '@subql/common-solana';
import {
  NodeConfig,
  DictionaryV2,
  RawDictionaryResponseData,
  DictionaryResponse,
  getLogger,
  IBlock,
} from '@subql/node-core';
import {
  SolanaBlock,
  SolanaHandlerKind,
  SolanaInstructionFilter,
  SolanaLogFilter,
  SolanaTransactionFilter,
  SubqlDatasource,
} from '@subql/types-solana';
import { uniqBy } from 'lodash';
import {
  SolanaProjectDs,
  SolanaProjectDsTemplate,
  SubqueryProject,
} from '../../../configure/SubqueryProject';
import { SolanaApi } from '../../../solana';
import { formatBlockUtil, transformBlock } from '../../../solana/utils.solana';
import { yargsOptions } from '../../../yargs';
import { groupedDataSources, validAddresses } from '../utils';
import {
  SolanaDictionaryV2QueryEntry,
  SolanaDictionaryTxConditions,
  SolanaDictionaryLogConditions,
  SolanaDictionaryInstructionConditions,
  RawSolanaBlock,
} from './types';


const MIN_FETCH_LIMIT = 200;

const logger = getLogger('dictionary-v2');

function applyAddresses(
  addresses?: (string | undefined | null)[],
): string[] | undefined {
  const queryAddressLimit = yargsOptions.argv['query-address-limit'];
  if (
    !addresses ||
    !addresses.length ||
    addresses.length > queryAddressLimit ||
    addresses.filter((v) => !v).length // DONT use find because 'undefined' and 'null' as falsey
  ) {
    return [];
  }

  return validAddresses(addresses).map((a) => a.toLowerCase());
}

function txFilterToDictionaryCondition(
  filter?: SolanaTransactionFilter,
  addresses?: (string | undefined | null)[],
): SolanaDictionaryTxConditions {
  // TODO implement
  throw new Error('Not implemented');

  // const txConditions: EthDictionaryTxConditions = {};
  // const toArray: (string | null)[] = [];
  // const fromArray: string[] = [];
  // const funcArray: string[] = [];

  // if (filter?.from) {
  //   fromArray.push(filter.from.toLowerCase());
  // }

  // const assignTo = (value: string | null | undefined) => {
  //   if (value === null) {
  //     toArray.push(null);
  //   } else if (value !== undefined) {
  //     toArray.push(value.toLowerCase());
  //   }
  // };

  // const optionsAddresses = applyAddresses(addresses);
  // if (!optionsAddresses?.length) {
  //   assignTo(filter?.to);
  // } else {
  //   if (filter?.to || filter?.to === null) {
  //     logger.warn(
  //       `TransactionFilter 'to' conflicts with 'address' in data source options, using data source option`,
  //     );
  //   }
  //   optionsAddresses.forEach(assignTo);
  // }

  // if (filter?.function) {
  //   funcArray.push(functionToSighash(filter.function));
  // }

  // if (toArray.length !== 0) {
  //   txConditions.to = toArray;
  // }
  // if (fromArray.length !== 0) {
  //   txConditions.from = fromArray;
  // }

  // if (funcArray.length !== 0) {
  //   txConditions.data = funcArray;
  // }

  // return txConditions;
}

function instructionFilterToDictionaryCondition(
  filter?: SolanaInstructionFilter,
  addresses?: (string | undefined | null)[],
): SolanaDictionaryInstructionConditions {
  // TODO implement
  throw new Error('Not implemented');
  // const txConditions: EthDictionaryTxConditions = {};
  // const toArray: (string | null)[] = [];
  // const fromArray: string[] = [];
  // const funcArray: string[] = [];

  // if (filter?.from) {
  //   fromArray.push(filter.from.toLowerCase());
  // }

  // const assignTo = (value: string | null | undefined) => {
  //   if (value === null) {
  //     toArray.push(null);
  //   } else if (value !== undefined) {
  //     toArray.push(value.toLowerCase());
  //   }
  // };

  // const optionsAddresses = applyAddresses(addresses);
  // if (!optionsAddresses?.length) {
  //   assignTo(filter?.to);
  // } else {
  //   if (filter?.to || filter?.to === null) {
  //     logger.warn(
  //       `TransactionFilter 'to' conflicts with 'address' in data source options, using data source option`,
  //     );
  //   }
  //   optionsAddresses.forEach(assignTo);
  // }

  // if (filter?.function) {
  //   funcArray.push(functionToSighash(filter.function));
  // }

  // if (toArray.length !== 0) {
  //   txConditions.to = toArray;
  // }
  // if (fromArray.length !== 0) {
  //   txConditions.from = fromArray;
  // }

  // if (funcArray.length !== 0) {
  //   txConditions.data = funcArray;
  // }

  // return txConditions;
}

function logFilterToDictionaryCondition(
  filter?: SolanaLogFilter,
  addresses?: (string | undefined | null)[],
): SolanaDictionaryLogConditions {
  // TODO implement
  throw new Error('Not implemented');
  // const logConditions: SolanaDictionaryLogConditions = {};
  // logConditions.address = applyAddresses(addresses);
  // if (filter?.topics) {
  //   for (let i = 0; i < Math.min(filter.topics.length, 4); i++) {
  //     const topic = filter.topics[i];
  //     if (!topic) {
  //       continue;
  //     }
  //     const field = `topics${i}`;
  //     // Initialized
  //     if (!logConditions[field]) {
  //       logConditions[field] = [];
  //     }
  //     if (topic === NOT_NULL_FILTER) {
  //       logConditions[field] = []; // TODO, check if !null
  //     } else {
  //       logConditions[field].push(eventToTopic(topic));
  //     }
  //   }
  // }
  // return logConditions;
}

function sanitiseDictionaryConditions(
  dictionaryConditions: SolanaDictionaryV2QueryEntry,
): SolanaDictionaryV2QueryEntry {
  if (!dictionaryConditions.logs?.length) {
    delete dictionaryConditions.logs;
  } else {
    dictionaryConditions.logs = uniqBy(dictionaryConditions.logs, (log) =>
      JSON.stringify(log),
    );
  }

  if (!dictionaryConditions.transactions?.length) {
    delete dictionaryConditions.transactions;
  } else {
    dictionaryConditions.transactions = uniqBy(
      dictionaryConditions.transactions,
      (tx) => JSON.stringify(tx),
    );
  }

  return dictionaryConditions;
}

export function buildDictionaryV2QueryEntry(
  dataSources: SolanaProjectDs[],
): SolanaDictionaryV2QueryEntry {
  const dictionaryConditions: SolanaDictionaryV2QueryEntry = {
    logs: [],
    transactions: [],
  };

  const groupedHandlers = groupedDataSources(dataSources);
  for (const [handler, addresses] of groupedHandlers) {
    // No filters, cant use dictionary
    if (!handler.filter && !addresses?.length) return {};

    switch (handler.kind) {
      case SolanaHandlerKind.Block:
        if (handler.filter?.modulo === undefined) {
          return {};
        }
        break;
      case SolanaHandlerKind.Transaction: {
        if (
          (handler.filter &&
            Object.values(handler.filter).filter((v) => v !== undefined)
              .length) ||
          validAddresses(addresses).length
        ) {
          dictionaryConditions.transactions ??= [];
          dictionaryConditions.transactions.push(
            txFilterToDictionaryCondition(handler.filter, addresses),
          );
        }
        break;
      }
      case SolanaHandlerKind.Instruction: {
        if (
          (handler.filter &&
            Object.values(handler.filter).filter((v) => v !== undefined)
              .length) ||
          validAddresses(addresses).length
        ) {
          dictionaryConditions.instructions ??= [];
          dictionaryConditions.instructions.push(
            instructionFilterToDictionaryCondition(handler.filter, addresses),
          );
        }
        break;
      }
      case SolanaHandlerKind.Log: {
        throw new Error('Not implemented')
        // if (
        //   handler.filter?.topics?.length ||
        //   validAddresses(addresses).length
        // ) {
        //   dictionaryConditions.logs ??= [];
        //   dictionaryConditions.logs.push(
        //     logFilterToDictionaryCondition(handler.filter, addresses),
        //   );
        // }

        break;
      }
      default:
    }
  }

  return sanitiseDictionaryConditions(dictionaryConditions);
}

function parseBlock(block: RawSolanaBlock): SolanaBlock {

  const methodName = 'parseBlock';

  // This is based on https://github.com/anza-xyz/kit/blob/main/packages/rpc-api/src/index.ts#L257
  const transformer = getDefaultResponseTransformerForSolanaRpc({
    allowedNumericKeyPaths: {
      [methodName]: [
        ['transactions', KEYPATH_WILDCARD, 'meta', 'preTokenBalances', KEYPATH_WILDCARD, 'accountIndex'],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'preTokenBalances',
          KEYPATH_WILDCARD,
          'uiTokenAmount',
          'decimals',
        ],
        ['transactions', KEYPATH_WILDCARD, 'meta', 'postTokenBalances', KEYPATH_WILDCARD, 'accountIndex'],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'postTokenBalances',
          KEYPATH_WILDCARD,
          'uiTokenAmount',
          'decimals',
        ],
        ['transactions', KEYPATH_WILDCARD, 'meta', 'rewards', KEYPATH_WILDCARD, 'commission'],
        ...innerInstructionsConfigs.map(c => [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'innerInstructions',
          KEYPATH_WILDCARD,
          ...c,
        ]),
        ...messageConfig.map(c => ['transactions', KEYPATH_WILDCARD, 'transaction', 'message', ...c] as const),
        ['rewards', KEYPATH_WILDCARD, 'commission'],
      ]
    }
  })

  return transformBlock(transformer(block, { methodName, params: undefined }) as any);
}

export class SolanaDictionaryV2 extends DictionaryV2<
  SolanaBlock,
  SubqlDatasource,
  SolanaDictionaryV2QueryEntry
> {
  // #skipTransactions: boolean;

  constructor(
    endpoint: string,
    nodeConfig: NodeConfig,
    project: SubqueryProject,
    private api: SolanaApi,
  ) {
    super(endpoint, project.network.chainId, nodeConfig);
    // this.#skipTransactions = !!new SolanaNodeConfig(nodeConfig)
    //   .skipTransactions;
  }

  static async create(
    endpoint: string,
    nodeConfig: NodeConfig,
    project: SubqueryProject,
    api: SolanaApi,
  ): Promise<SolanaDictionaryV2> {
    const dictionary = new SolanaDictionaryV2(endpoint, nodeConfig, project, api);
    await dictionary.init();
    return dictionary;
  }

  buildDictionaryQueryEntries(
    dataSources: (SolanaProjectDs | SolanaProjectDsTemplate)[],
  ): SolanaDictionaryV2QueryEntry {
    return buildDictionaryV2QueryEntry(dataSources);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getData(
    startBlock: number,
    endBlock: number,
    limit: number = MIN_FETCH_LIMIT,
  ): Promise<DictionaryResponse<IBlock<SolanaBlock> | number> | undefined> {
    return super.getData(startBlock, endBlock, limit, {
      blockHeader: true,
      logs: { transaction: true/*!this.#skipTransactions*/ },
      instructions: { transaction: true, },
      transactions: { log: true, instructions: true },
    });
  }

  convertResponseBlocks<RFB = RawSolanaBlock>(
    data: RawDictionaryResponseData<RFB>,
  ): DictionaryResponse<IBlock<SolanaBlock>> | undefined {
    try {
      const blocks: IBlock<SolanaBlock>[] = (
        (data.blocks as unknown[]) || []
      ).map((b) => formatBlockUtil(parseBlock(b)));

      if (!blocks.length) {
        return {
          batchBlocks: [],
          lastBufferedHeight: undefined, // This will get set to the request end block in the base class.
        } as any;
      }
      return {
        batchBlocks: blocks,
        lastBufferedHeight: Number(blocks[blocks.length - 1].block.blockHeight),
      };
    } catch (e: any) {
      logger.error(e, `Failed to handle block response}`);
      throw e;
    }
  }
}
