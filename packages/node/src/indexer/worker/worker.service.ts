// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject, Injectable } from '@nestjs/common';
import { SubqlSolanaDataSource } from '@subql/common-solana';
import {
  NodeConfig,
  IProjectService,
  ProcessBlockResponse,
  ApiService,
  BaseWorkerService,
  IProjectUpgradeService,
  IBlock,
  Header,
} from '@subql/node-core';
import { SolanaProjectDs } from '../../configure/SubqueryProject';
import { SolanaApi, SolanaSafeApi } from '../../solana';
import { solanaBlockToHeader } from '../../solana/utils.solana';
import { IndexerManager } from '../indexer.manager';
import { BlockContent, getBlockSize } from '../types';

export type FetchBlockResponse = Header;

export type WorkerStatusResponse = {
  threadId: number;
  isIndexing: boolean;
  fetchedBlocks: number;
  toFetchBlocks: number;
};

@Injectable()
export class WorkerService extends BaseWorkerService<
  BlockContent,
  FetchBlockResponse,
  SubqlSolanaDataSource,
  {}
> {
  constructor(
    @Inject('APIService')
    private apiService: ApiService<
      SolanaApi,
      SolanaSafeApi,
      IBlock<BlockContent>[]
    >,
    private indexerManager: IndexerManager,
    @Inject('IProjectService')
    projectService: IProjectService<SolanaProjectDs>,
    @Inject('IProjectUpgradeService')
    projectUpgradeService: IProjectUpgradeService,
    nodeConfig: NodeConfig,
  ) {
    super(projectService, projectUpgradeService, nodeConfig);
  }

  protected async fetchChainBlock(
    heights: number,
    extra: {},
  ): Promise<IBlock<BlockContent>> {
    const [block] = await this.apiService.fetchBlocks([heights]);
    return block;
  }

  protected toBlockResponse(block: BlockContent): Header {
    return solanaBlockToHeader(block);
  }

  protected async processFetchedBlock(
    block: IBlock<BlockContent>,
    dataSources: SubqlSolanaDataSource[],
  ): Promise<ProcessBlockResponse> {
    return this.indexerManager.indexBlock(block, dataSources);
  }

  getBlockSize(block: IBlock<BlockContent>): number {
    return getBlockSize(block.block);
  }
}
