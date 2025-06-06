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
import { BlockContent, getBlockSize } from './indexer/types';
import { IIndexerWorker } from './indexer/worker/worker';
import { SolanaApiService } from './solana';
import { SolanaSafeApi } from './solana/api.solana';

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
    >
{
  blockHandlerKind = SolanaHandlerKind.Block;
  isCustomDs = isCustomDs;
  isRuntimeDs = isRuntimeDs;
  packageVersion = packageVersion;

  constructor(@Inject('APIService') private apiService: SolanaApiService) {}

  async fetchBlocks(blockNums: number[]): Promise<IBlock<SolanaBlock>[]> {
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
    // Although the block production rate is 400ms we use a larger value to reduce the interval where the heads are refetched
    return 2000;
    // return 400; //Unit in MS
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
    return header.timestamp;
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
      // Merge handler filtes with params.args
      dsObj.mapping.handlers = dsObj.mapping.handlers.map((handler) => ({
        ...handler,
        filter: {
          ...handler.filter,
          ...params.args,
        } as any,
      }));

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

  async onProjectChange(project: SubqueryProject): Promise<void> {
    await Promise.all(
      project.dataSources.map((ds) => this.apiService.api.decoder.loadIdls(ds)),
    );
    await Promise.all(
      project.templates.map((ds) => this.apiService.api.decoder.loadIdls(ds)),
    );
    // TODO if solana supports light blocks implement this function
    // this.apiService.updateBlockFetching();
  }
}
