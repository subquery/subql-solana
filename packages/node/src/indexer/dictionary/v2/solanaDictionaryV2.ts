// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  getDefaultResponseTransformerForSolanaRpc,
  innerInstructionsConfigs,
  KEYPATH_WILDCARD,
  messageConfig,
} from '@solana/rpc-transformers';
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
import { SolanaApi, SolanaDecoder } from '../../../solana';
import { formatBlockUtil, transformBlock } from '../../../solana/block.solana';
import {
  SolanaDictionaryV2QueryEntry,
  SolanaDictionaryTxConditions,
  SolanaDictionaryLogConditions,
  SolanaDictionaryInstructionConditions,
  RawSolanaBlock,
} from './types';

const MIN_FETCH_LIMIT = 200;

const logger = getLogger('dictionary-v2');

function txFilterToDictionaryCondition(
  filter?: SolanaTransactionFilter,
): SolanaDictionaryTxConditions {
  const txConditions: SolanaDictionaryTxConditions = {};

  if (filter?.signerAccountKey) {
    txConditions.signerAccountKeys = [filter.signerAccountKey];
  }

  return txConditions;
}

function instructionFilterToDictionaryCondition(
  decoder: SolanaDecoder,
  filter?: SolanaInstructionFilter,
): SolanaDictionaryInstructionConditions {
  const instConditions: SolanaDictionaryInstructionConditions = {};

  if (filter?.accounts) {
    instConditions.accounts = filter.accounts;
  }

  if (filter?.programId) {
    instConditions.programIds = [filter.programId];
  }

  if (filter?.discriminator) {
    if (!filter.programId) {
      throw new Error(
        'programId is required to be set when a discriminator is provided',
      );
    }
    const disc = decoder.parseDiscriminator(
      filter.discriminator,
      filter.programId,
    );
    instConditions.discriminators = [`0x${disc.toString('hex')}`];
  }

  // TO CONFIRM
  /*
    undefined -> failed + successful
    true -> successful
    false -> failed
  */
  if (!filter?.includeFailed) {
    instConditions.isCommitted = true;
  }

  return instConditions;
}

function logFilterToDictionaryCondition(
  filter?: SolanaLogFilter,
): SolanaDictionaryLogConditions {
  const logConditions: SolanaDictionaryLogConditions = {};

  if (filter?.programId) {
    logConditions.programIds = [filter.programId];
  }

  return logConditions;
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
  decoder: SolanaDecoder,
  dataSources: SolanaProjectDs[],
): SolanaDictionaryV2QueryEntry {
  const dictionaryConditions: SolanaDictionaryV2QueryEntry = {
    logs: [],
    transactions: [],
  };

  for (const ds of dataSources) {
    for (const handler of ds.mapping.handlers) {
      // No filters, cant use dictionary
      if (!handler.filter) return {};

      switch (handler.kind) {
        case SolanaHandlerKind.Block:
          if (handler.filter?.modulo === undefined) {
            return {};
          }
          break;
        case SolanaHandlerKind.Transaction: {
          if (
            handler.filter &&
            Object.values(handler.filter).filter((v) => v !== undefined).length
          ) {
            dictionaryConditions.transactions ??= [];
            dictionaryConditions.transactions.push(
              txFilterToDictionaryCondition(handler.filter),
            );
          }
          break;
        }
        case SolanaHandlerKind.Instruction: {
          if (
            handler.filter &&
            Object.values(handler.filter).filter((v) => v !== undefined).length
          ) {
            dictionaryConditions.instructions ??= [];
            dictionaryConditions.instructions.push(
              instructionFilterToDictionaryCondition(decoder, handler.filter),
            );
          }
          break;
        }
        case SolanaHandlerKind.Log: {
          if (
            handler.filter &&
            Object.values(handler.filter).filter((v) => v !== undefined).length
          ) {
            dictionaryConditions.logs ??= [];
            dictionaryConditions.logs.push(
              logFilterToDictionaryCondition(handler.filter),
            );
          }

          break;
        }
        default:
      }
    }
  }

  return sanitiseDictionaryConditions(dictionaryConditions);
}

function parseBlock(
  block: RawSolanaBlock,
  decoder: SolanaDecoder,
): SolanaBlock {
  const methodName = 'parseBlock';

  // This is based on https://github.com/anza-xyz/kit/blob/main/packages/rpc-api/src/index.ts#L257
  const transformer = getDefaultResponseTransformerForSolanaRpc({
    allowedNumericKeyPaths: {
      [methodName]: [
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'preTokenBalances',
          KEYPATH_WILDCARD,
          'accountIndex',
        ],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'preTokenBalances',
          KEYPATH_WILDCARD,
          'uiTokenAmount',
          'decimals',
        ],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'postTokenBalances',
          KEYPATH_WILDCARD,
          'accountIndex',
        ],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'postTokenBalances',
          KEYPATH_WILDCARD,
          'uiTokenAmount',
          'decimals',
        ],
        [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'rewards',
          KEYPATH_WILDCARD,
          'commission',
        ],
        ...innerInstructionsConfigs.map((c) => [
          'transactions',
          KEYPATH_WILDCARD,
          'meta',
          'innerInstructions',
          KEYPATH_WILDCARD,
          ...c,
        ]),
        ...messageConfig.map(
          (c) =>
            [
              'transactions',
              KEYPATH_WILDCARD,
              'transaction',
              'message',
              ...c,
            ] as const,
        ),
        ['rewards', KEYPATH_WILDCARD, 'commission'],
      ],
    },
  });

  const rpcBlock = transformer(
    { result: block },
    { methodName, params: undefined },
  );

  const res = transformBlock(rpcBlock as any, decoder);

  return res;
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
    const dictionary = new SolanaDictionaryV2(
      endpoint,
      nodeConfig,
      project,
      api,
    );
    await dictionary.init();
    return dictionary;
  }

  buildDictionaryQueryEntries(
    dataSources: (SolanaProjectDs | SolanaProjectDsTemplate)[],
  ): SolanaDictionaryV2QueryEntry {
    return buildDictionaryV2QueryEntry(this.api.decoder, dataSources);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getData(
    startBlock: number,
    endBlock: number,
    limit: number = MIN_FETCH_LIMIT,
  ): Promise<DictionaryResponse<IBlock<SolanaBlock> | number> | undefined> {
    return super.getData(startBlock, endBlock, limit, {
      blockHeader: true,
      logs: { transaction: true /*!this.#skipTransactions*/ },
      instructions: { transaction: true },
      transactions: { log: true, instructions: true },
    });
  }

  convertResponseBlocks<RFB = RawSolanaBlock>(
    data: RawDictionaryResponseData<RFB>,
  ): DictionaryResponse<IBlock<SolanaBlock>> | undefined {
    try {
      const blocks: IBlock<SolanaBlock>[] = (
        (data.blocks as unknown[]) || []
      ).map((b) => formatBlockUtil(parseBlock(b, this.api.decoder)));

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
      logger.error(e, `Failed to handle block response`);
      throw e;
    }
  }
}
