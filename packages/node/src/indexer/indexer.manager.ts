// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject, Injectable } from '@nestjs/common';
import {
  isBlockHandlerProcessor,
  isCustomDs,
  isRuntimeDs,
  SubqlSolanaCustomDataSource,
  SubqlSolanaDataSource,
  isInstructionHandlerProcessor,
  isTransactionHandlerProcessor,
  isLogHandlerProcessor,
} from '@subql/common-solana';
import {
  ApiService,
  NodeConfig,
  profiler,
  IndexerSandbox,
  ProcessBlockResponse,
  BaseIndexerManager,
  IBlock,
  SandboxService,
  DsProcessorService,
  DynamicDsService,
  UnfinalizedBlocksService,
} from '@subql/node-core';
import {
  SolanaHandlerKind,
  SolanaTransaction,
  SolanaBlock,
  SubqlRuntimeDatasource,
  SolanaBlockFilter,
  SolanaTransactionFilter,
  SolanaInstruction,
  SolanaInstructionFilter,
  SolanaRuntimeHandlerInputMap,
  SolanaLogMessage,
  SolanaLogFilter,
} from '@subql/types-solana';
import { groupBy } from 'lodash';
import { BlockchainService } from '../blockchain.service';
import { SolanaProjectDs } from '../configure/SubqueryProject';
import { SolanaApi } from '../solana';
import {
  filterBlocksProcessor,
  filterInstructionsProcessor,
  filterLogsProcessor,
  filterTransactionsProcessor,
} from '../solana/utils.solana';
import { BlockContent } from './types';

@Injectable()
export class IndexerManager extends BaseIndexerManager<
  SolanaApi,
  unknown, // Safe Provider
  BlockContent,
  ApiService,
  SubqlSolanaDataSource,
  SubqlSolanaCustomDataSource,
  typeof FilterTypeMap,
  typeof ProcessorTypeMap,
  SolanaRuntimeHandlerInputMap
> {
  protected isRuntimeDs = isRuntimeDs;
  protected isCustomDs = isCustomDs;

  constructor(
    @Inject('APIService') apiService: ApiService,
    nodeConfig: NodeConfig,
    sandboxService: SandboxService<unknown, SolanaApi>,
    dsProcessorService: DsProcessorService<
      SubqlSolanaDataSource,
      SubqlSolanaCustomDataSource
    >,
    dynamicDsService: DynamicDsService<SubqlSolanaDataSource>,
    @Inject('IUnfinalizedBlocksService')
    unfinalizedBlocksService: UnfinalizedBlocksService,
    @Inject('IBlockchainService') blockchainService: BlockchainService,
  ) {
    super(
      apiService,
      nodeConfig,
      sandboxService,
      dsProcessorService,
      dynamicDsService,
      unfinalizedBlocksService,
      FilterTypeMap,
      ProcessorTypeMap,
      blockchainService,
    );
  }

  @profiler()
  async indexBlock(
    block: IBlock<BlockContent>,
    dataSources: SubqlSolanaDataSource[],
  ): Promise<ProcessBlockResponse> {
    return super.internalIndexBlock(block, dataSources, () =>
      this.blockchainService.getSafeApi(block.block),
    );
  }

  protected getDsProcessor(
    ds: SubqlSolanaDataSource,
    safeApi: unknown,
  ): IndexerSandbox {
    return this.sandboxService.getDsProcessor(
      ds,
      safeApi,
      this.apiService.unsafeApi.api,
    );
  }

  protected async indexBlockData(
    block: BlockContent,
    dataSources: SolanaProjectDs[],
    getVM: (d: SolanaProjectDs) => Promise<IndexerSandbox>,
  ): Promise<void> {
    await this.indexBlockContent(block, dataSources, getVM);

    for (const tx of block.transactions) {
      await this.indexTransaction(tx, dataSources, getVM);

      // There is probably only one item per group but that could change based on the data structure
      const innerInstructions = groupBy(
        tx.meta?.innerInstructions,
        (inner) => inner.index,
      );

      for (const [idx, instruction] of Object.entries(
        tx.transaction.message.instructions ?? [],
      )) {
        await this.indexInstruction(instruction, dataSources, getVM);

        for (const innerInstrutions1 of innerInstructions[idx]) {
          for (const innerInstrution of innerInstrutions1.instructions) {
            await this.indexInstruction(innerInstrution, dataSources, getVM);
          }
        }
      }
    }
  }

  private async indexBlockContent(
    block: SolanaBlock,
    dataSources: SolanaProjectDs[],
    getVM: (d: SolanaProjectDs) => Promise<IndexerSandbox>,
  ): Promise<void> {
    for (const ds of dataSources) {
      await this.indexData(SolanaHandlerKind.Block, block, ds, getVM);
    }
  }

  private async indexTransaction(
    tx: SolanaTransaction,
    dataSources: SolanaProjectDs[],
    getVM: (d: SolanaProjectDs) => Promise<IndexerSandbox>,
  ): Promise<void> {
    for (const ds of dataSources) {
      await this.indexData(SolanaHandlerKind.Transaction, tx, ds, getVM);
    }
  }

  private async indexInstruction(
    instruction: SolanaInstruction,
    dataSources: SolanaProjectDs[],
    getVM: (d: SolanaProjectDs) => Promise<IndexerSandbox>,
  ): Promise<void> {
    for (const ds of dataSources) {
      await this.indexData(
        SolanaHandlerKind.Instruction,
        instruction,
        ds,
        getVM,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async prepareFilteredData(
    kind: SolanaHandlerKind,
    data: any,
    ds: SubqlRuntimeDatasource,
  ): Promise<any> {
    return DataIDLParser[kind](data, ds);
  }
}

const ProcessorTypeMap = {
  [SolanaHandlerKind.Block]: isBlockHandlerProcessor,
  [SolanaHandlerKind.Transaction]: isTransactionHandlerProcessor,
  [SolanaHandlerKind.Instruction]: isInstructionHandlerProcessor,
  [SolanaHandlerKind.Log]: isLogHandlerProcessor,
};

const FilterTypeMap = {
  [SolanaHandlerKind.Block]: (
    data: SolanaBlock,
    filter: SolanaBlockFilter,
    ds: SubqlSolanaDataSource,
  ) => filterBlocksProcessor(data, filter),
  [SolanaHandlerKind.Transaction]: (
    data: SolanaTransaction,
    filter: SolanaTransactionFilter,
    ds: SubqlSolanaDataSource,
  ) => filterTransactionsProcessor(data, filter),
  [SolanaHandlerKind.Instruction]: (
    data: SolanaInstruction,
    filter: SolanaInstructionFilter,
    ds: SubqlSolanaDataSource,
  ) => filterInstructionsProcessor(data, filter),
  [SolanaHandlerKind.Log]: (
    data: SolanaLogMessage,
    filter: SolanaLogFilter,
    ds: SubqlSolanaDataSource,
  ) => filterLogsProcessor(data, filter),
};

const DataIDLParser = {
  [SolanaHandlerKind.Block]: (data: SolanaBlock) => data,
  [SolanaHandlerKind.Transaction]: (data: SolanaTransaction) => data,
  [SolanaHandlerKind.Instruction]: (
    data: SolanaInstruction,
    ds: SubqlRuntimeDatasource,
  ) => data, // TODO instruction will require parsing data with IDL
  [SolanaHandlerKind.Log]: (data: SolanaLogMessage) => data,
};
