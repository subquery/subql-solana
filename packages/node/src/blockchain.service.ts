// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject } from '@nestjs/common';
import {
  SolanaRuntimeDataSourceImpl,
  isCustomDs,
  isRuntimeDs,
  SubqlSolanaDataSource,
} from '@subql/common-solana';
import {
  DatasourceParams,
  Header,
  IBlock,
  IBlockchainService,
} from '@subql/node-core';
import {
  SolanaHandlerKind,
  SolanaBlock,
  SubqlCustomDatasource,
  SubqlCustomHandler,
  SubqlDatasource,
  SubqlMapping,
} from '@subql/types-solana';
import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubqueryProject } from './configure/SubqueryProject';
import { SolanaSafeApi } from './solana/api.solana';
import { BlockContent, getBlockSize } from './indexer/types';
import { IIndexerWorker } from './indexer/worker/worker';
import { SolanaApiService } from './solana';
import { solanaBlockToHeader } from './solana/utils.solana';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: packageVersion } = require('../package.json');

export class BlockchainService
  implements
  IBlockchainService<
    SubqlDatasource,
    SubqlCustomDatasource<string, SubqlMapping<SubqlCustomHandler>>,
    SubqueryProject,
    SolanaSafeApi,
    SolanaBlock, // No light block for Solana
    SolanaBlock,
    IIndexerWorker
  > {
  blockHandlerKind = SolanaHandlerKind.Block;
  isCustomDs = isCustomDs;
  isRuntimeDs = isRuntimeDs;
  packageVersion = packageVersion;

  constructor(@Inject('APIService') private apiService: SolanaApiService) {}

  async fetchBlocks(
    blockNums: number[],
  ): Promise<IBlock<SolanaBlock>[]> {
    return this.apiService.fetchBlocks(blockNums);
  }

  async fetchBlockWorker(
    worker: IIndexerWorker,
    blockNum: number,
    context: { workers: IIndexerWorker[] },
  ): Promise<Header> {
    return worker.fetchBlock(blockNum, 0);
  }

  getBlockSize(block: IBlock<BlockContent>): number {
    return getBlockSize(block.block);
  }

  async getFinalizedHeader(): Promise<Header> {
    return this.apiService.api.getFinalizedBlockHeader();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getBestHeight(): Promise<number> {
    return this.apiService.api.getBestBlockHeight();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getChainInterval(): Promise<number> {
    return 400; //Unit in MS
  }

  async getHeaderForHash(hash: string): Promise<Header> {
    return this.apiService.api.getHeaderByHeightOrHash(hash);
  }

  async getHeaderForHeight(height: number): Promise<Header> {
    return this.apiService.api.getHeaderByHeightOrHash(height);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSafeApi(block: BlockContent): Promise<SolanaSafeApi> {
    return this.apiService.safeApi(Number(block.blockHeight));
  }

  async getBlockTimestamp(height: number): Promise<Date> {
    const header = await this.getHeaderForHeight(height);
    return header.timestamp!;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async updateDynamicDs(
    params: DatasourceParams,
    dsObj: SubqlSolanaDataSource | SubqlCustomDatasource,
  ): Promise<void> {
    if (isCustomDs(dsObj)) {
      dsObj.processor.options = {
        ...dsObj.processor.options,
        ...params.args,
      };
      // TODO how to retain this functionality
      // await this.dsProcessorService.validateCustomDs([dsObj]);
    } else if (isRuntimeDs(dsObj)) {
      dsObj.options = {
        ...dsObj.options,
        ...params.args,
      };

      const parsedDs = plainToClass(SolanaRuntimeDataSourceImpl, dsObj);

      const errors = validateSync(parsedDs, {
        whitelist: true,
        forbidNonWhitelisted: false,
      });
      if (errors.length) {
        throw new Error(
          `Dynamic ds is invalid\n${errors
            .map((e) => e.toString())
            .join('\n')}`,
        );
      }
    }
    // return dsObj;
  }

  onProjectChange(project: SubqueryProject): Promise<void> | void {
    // TODO if solana supports light blocks implement this function
    // this.apiService.updateBlockFetching();
  }
}
