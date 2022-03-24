// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getHeapStatistics } from 'v8';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

import { Connection } from '@solana/web3.js';
import { isRuntimeDataSourceV0_0_1 } from '@subql/common-solana/dist/project/versioned/v0_0_1';
import { SubqlHandlerFilter, DictionaryQueryEntry } from '@subql/types';
import {
  SubqlSolanaDatasource,
  SubqlSolanaHandler,
  SubqlSolanaHandlerFilter,
  SubqlSolanaHandlerKind,
} from '@subql/types-solana';
import { isUndefined, range, sortBy, uniqBy } from 'lodash';
import { NodeConfig } from '../configure/NodeConfig';
import { SubquerySolanaProject } from '../configure/project.model';
import { getLogger } from '../utils/logger';
import { isBaseSolanaHandler, isCustomSolanaHandler } from '../utils/project';
import { delay } from '../utils/promise';
import { fetchSolanaBlocksBatches } from '../utils/solana-helper';

import { getYargsOption } from '../yargs';
import { ApiService } from './api.service';
import { BlockedQueue } from './BlockedQueue';
import {
  Dictionary,
  DictionaryService,
  SolanaDictionary,
} from './dictionary.service';
import { DsProcessorService } from './ds-processor.service';
import { IndexerEvent } from './events';
import { BlockContent } from './types';
import { isCustomSolanaDs, isRuntimeSolanaDs } from './utils';
const logger = getLogger('fetch');
const BLOCK_TIME_VARIANCE = 5;
const DICTIONARY_MAX_QUERY_SIZE = 10000;
const CHECK_MEMORY_INTERVAL = 60000;
const HIGH_THRESHOLD = 0.85;
const LOW_THRESHOLD = 0.6;

const { argv } = getYargsOption();

function checkMemoryUsage(batchSize: number, batchSizeScale: number): number {
  const memoryData = getHeapStatistics();
  const ratio = memoryData.used_heap_size / memoryData.heap_size_limit;
  if (argv.profiler) {
    logger.info(`Heap Statistics: ${JSON.stringify(memoryData)}`);
    logger.info(`Heap Usage: ${ratio}`);
  }
  let scale = batchSizeScale;

  if (ratio > HIGH_THRESHOLD) {
    if (scale > 0) {
      scale = Math.max(scale - 0.1, 0);
      logger.debug(`Heap usage: ${ratio}, decreasing batch size by 10%`);
    }
  }

  if (ratio < LOW_THRESHOLD) {
    if (scale < 1) {
      scale = Math.min(scale + 0.1, 1);
      logger.debug(`Heap usage: ${ratio} increasing batch size by 10%`);
    }
  }
  return scale;
}

@Injectable()
export class FetchService implements OnApplicationShutdown {
  private latestBestHeight: number;
  private latestFinalizedHeight: number;
  private latestProcessedHeight: number;
  private latestBufferedHeight: number;
  private blockBuffer: BlockedQueue<BlockContent>;
  private blockNumberBuffer: BlockedQueue<number>;
  private isShutdown = false;
  private parentSpecVersion: number;
  private useDictionary: boolean;
  private dictionaryQueryEntries?: DictionaryQueryEntry[];
  private batchSizeScale: number;

  constructor(
    private apiService: ApiService,
    private nodeConfig: NodeConfig,
    private project: SubquerySolanaProject,
    private dictionaryService: DictionaryService,
    private dsProcessorService: DsProcessorService,
    private eventEmitter: EventEmitter2,
  ) {
    this.blockBuffer = new BlockedQueue<BlockContent>(
      this.nodeConfig.batchSize * 3,
    );
    this.blockNumberBuffer = new BlockedQueue<number>(
      this.nodeConfig.batchSize * 3,
    );
    this.batchSizeScale = 1;
  }

  onApplicationShutdown(): void {
    this.isShutdown = true;
  }

  get api(): Connection {
    return this.apiService.getApi();
  }

  // TODO: if custom ds doesn't support dictionary, use baseFilter, if yes, let
  getDictionaryQueryEntries(): DictionaryQueryEntry[] {
    const queryEntries: DictionaryQueryEntry[] = [];

    const dataSources = this.project.dataSources.filter((ds) =>
      isRuntimeDataSourceV0_0_1(ds),
    );
    for (const ds of dataSources) {
      const plugin = isCustomSolanaDs(ds)
        ? this.dsProcessorService.getDsProcessor(ds)
        : undefined;
      for (const handler of ds.mapping.handlers) {
        const baseHandlerKind = this.getBaseHandlerKind(ds, handler);
        let filterList: SubqlHandlerFilter[];
        if (isCustomSolanaDs(ds)) {
          const processor = plugin.handlerProcessors[handler.kind];
          if (processor.dictionaryQuery) {
            const queryEntry = processor.dictionaryQuery(handler.filter, ds);
            if (queryEntry) {
              queryEntries.push(queryEntry);
              continue;
            }
          }
          filterList = this.getBaseHandlerFilters<SubqlHandlerFilter>(
            ds,
            handler.kind,
          );
        } else {
          filterList = [handler.filter];
        }
        filterList = filterList.filter((f) => f);
        if (!filterList.length) return [];
        switch (baseHandlerKind) {
          case SubqlSolanaHandlerKind.Transaction: {
            if (handler.filter && Object.keys(handler.filter).length > 0) {
              const conditions = [];
              for (const field in handler.filter) {
                conditions.push({
                  field,
                  value: handler.filter[field],
                });
              }
              queryEntries.push({
                entity: 'transactions',
                conditions,
              });
            }
            break;
          }
          default:
        }
      }
    }

    return uniqBy(
      queryEntries,
      (item) =>
        `${item.entity}|${JSON.stringify(
          sortBy(item.conditions, (c) => c.field),
        )}`,
    );
  }

  register(next: (value: BlockContent) => Promise<void>): () => void {
    let stopper = false;
    void (async () => {
      while (!stopper && !this.isShutdown) {
        const block = await this.blockBuffer.take();
        this.eventEmitter.emit(IndexerEvent.BlockQueueSize, {
          value: this.blockBuffer.size,
        });
        let success = false;
        while (!success) {
          try {
            await next(block);
            success = true;
          } catch (e) {
            logger.error(
              e,
              `failed to index block at height ${
                +block.block.block.parentSlot + 1
              } ${e.handler ? `${e.handler}(${e.handlerArgs ?? ''})` : ''}`,
            );
            process.exit(1);
          }
        }
      }
    })();
    return () => (stopper = true);
  }

  async init(): Promise<void> {
    this.dictionaryQueryEntries = this.getDictionaryQueryEntries();
    this.useDictionary =
      !!this.dictionaryQueryEntries?.length &&
      !!this.project.network.dictionary;

    this.eventEmitter.emit(IndexerEvent.UsingDictionary, {
      value: Number(this.useDictionary),
    });
    await this.getLatestBlockHead();
  }

  @Interval(CHECK_MEMORY_INTERVAL)
  checkBatchScale() {
    if (argv['scale-batch-size']) {
      const scale = checkMemoryUsage(
        this.nodeConfig.batchSize,
        this.batchSizeScale,
      );

      if (this.batchSizeScale !== scale) {
        this.batchSizeScale = scale;
      }
    }
  }

  @Interval(BLOCK_TIME_VARIANCE * 1000)
  async getLatestBlockHead() {
    if (!this.api) {
      logger.debug(`Skip fetch finalized block until API is ready`);
      return;
    }
    try {
      const finalizedBlock = await this.api.getSlot();
      const currentFinalizedHeight = parseInt(finalizedBlock.toString());
      if (this.latestFinalizedHeight !== currentFinalizedHeight) {
        this.latestFinalizedHeight = currentFinalizedHeight;
        this.eventEmitter.emit(IndexerEvent.BlockTarget, {
          height: this.latestFinalizedHeight,
        });
      }
    } catch (e) {
      logger.error(e, `Having a problem when get finalized block`);
    }
  }

  // @Interval(BLOCK_TIME_VARIANCE * 1000)
  // async getBestBlockHead() {
  //   if (!this.api) {
  //     logger.debug(`Skip fetch best block until API is ready`);
  //     return;
  //   }
  //   try {
  //     const bestHeader = await this.api.rpc.chain.getHeader();
  //     const currentBestHeight = bestHeader.number.toNumber();
  //     if (this.latestBestHeight !== currentBestHeight) {
  //       this.latestBestHeight = currentBestHeight;
  //       this.eventEmitter.emit(IndexerEvent.BlockBest, {
  //         height: this.latestBestHeight,
  //       });
  //     }
  //   } catch (e) {
  //     logger.error(e, `Having a problem when get best block`);
  //   }
  // }

  latestProcessed(height: number): void {
    this.latestProcessedHeight = height;
  }

  async startLoop(initBlockHeight: number): Promise<void> {
    if (isUndefined(this.latestProcessedHeight)) {
      this.latestProcessedHeight = initBlockHeight - 1;
    }
    await Promise.all([
      this.fillNextBlockBuffer(initBlockHeight),
      this.fillBlockBuffer(),
    ]);
  }

  async fillNextBlockBuffer(initBlockHeight: number): Promise<void> {
    let startBlockHeight: number;

    while (!this.isShutdown) {
      startBlockHeight = this.latestBufferedHeight
        ? this.latestBufferedHeight + 1
        : initBlockHeight;
      if (
        this.blockNumberBuffer.freeSize < this.nodeConfig.batchSize ||
        startBlockHeight > this.latestFinalizedHeight
      ) {
        await delay(1);
        continue;
      }
      //the dictionary is used when the .yaml file has 'dictionary' & 'filter'
      if (this.useDictionary) {
        const queryEndBlock = startBlockHeight + DICTIONARY_MAX_QUERY_SIZE;
        try {
          const dictionary = await this.dictionaryService.getDictionary(
            startBlockHeight,
            queryEndBlock,
            this.nodeConfig.batchSize,
            this.dictionaryQueryEntries,
          );
          if (
            dictionary &&
            this.dictionaryValidation(dictionary, startBlockHeight)
          ) {
            const { batchBlocks } = dictionary;
            if (batchBlocks.length === 0) {
              this.setLatestBufferedHeight(
                Math.min(
                  queryEndBlock - 1,
                  dictionary._metadata.lastProcessedHeight,
                ),
              );
            } else {
              this.blockNumberBuffer.putAll(batchBlocks);
              this.setLatestBufferedHeight(batchBlocks[batchBlocks.length - 1]);
            }
            this.eventEmitter.emit(IndexerEvent.BlocknumberQueueSize, {
              value: this.blockNumberBuffer.size,
            });
            continue; // skip nextBlockRange() way
          }
          // else use this.nextBlockRange()
        } catch (e) {
          logger.debug(`Fetch dictionary stopped: ${e.message}`);
          this.eventEmitter.emit(IndexerEvent.SkipDictionary);
        }
      }
      const endHeight = this.nextEndBlockHeight(startBlockHeight);
      this.blockNumberBuffer.putAll(range(startBlockHeight, endHeight + 1));
      this.setLatestBufferedHeight(endHeight);
    }
  }

  async fillBlockBuffer(): Promise<void> {
    while (!this.isShutdown) {
      const takeCount = Math.min(
        this.blockBuffer.freeSize,
        this.nodeConfig.batchSize,
      );

      if (this.blockNumberBuffer.size === 0 || takeCount === 0) {
        await delay(1);
        continue;
      }

      const bufferBlocks = await this.blockNumberBuffer.takeAll(5); // change me, to many requests
      const blocks = await fetchSolanaBlocksBatches(this.api, bufferBlocks);
      // console.log("blocks", blocks);
      logger.info(
        `fetch block [${bufferBlocks[0]},${
          bufferBlocks[bufferBlocks.length - 1]
        }], total ${bufferBlocks.length} blocks`,
      );
      this.blockBuffer.putAll(blocks);
      this.eventEmitter.emit(IndexerEvent.BlockQueueSize, {
        value: this.blockBuffer.size,
      });
    }
  }

  // @profiler(argv.profiler)
  // async fetchMeta(height: number): Promise<boolean> {
  //   const parentBlockHash = await this.api.rpc.chain.getBlockHash(
  //     Math.max(height - 1, 0),
  //   );
  //   const runtimeVersion = await this.api.rpc.state.getRuntimeVersion(
  //     parentBlockHash,
  //   );
  //   const specVersion = runtimeVersion.specVersion.toNumber();
  //   if (this.parentSpecVersion !== specVersion) {
  //     const blockHash = await this.api.rpc.chain.getBlockHash(height);
  //     await SubstrateUtil.prefetchMetadata(this.api, blockHash);
  //     this.parentSpecVersion = specVersion;
  //     return true;
  //   }
  //   return false;
  // }

  private nextEndBlockHeight(startBlockHeight: number): number {
    let endBlockHeight = startBlockHeight + this.nodeConfig.batchSize - 1;
    if (endBlockHeight > this.latestFinalizedHeight) {
      endBlockHeight = this.latestFinalizedHeight;
    }
    return endBlockHeight;
  }

  private dictionaryValidation(
    { _metadata: metaData }: SolanaDictionary,
    startBlockHeight: number,
  ): boolean {
    if (metaData.lastProcessedHeight < startBlockHeight) {
      logger.warn(
        `Dictionary indexed block is behind current indexing block height`,
      );
      this.eventEmitter.emit(IndexerEvent.SkipDictionary);
      return false;
    }
    return true;
  }

  private setLatestBufferedHeight(height: number): void {
    this.latestBufferedHeight = height;
    this.eventEmitter.emit(IndexerEvent.BlocknumberQueueSize, {
      value: this.blockNumberBuffer.size,
    });
  }

  private getBaseHandlerKind(
    ds: SubqlSolanaDatasource,
    handler: SubqlSolanaHandler,
  ): SubqlSolanaHandlerKind {
    if (isRuntimeSolanaDs(ds) && isBaseSolanaHandler(handler)) {
      return handler.kind;
    } else if (isCustomSolanaDs(ds) && isCustomSolanaHandler(handler)) {
      const plugin = this.dsProcessorService.getDsProcessor(ds);
      const baseHandler =
        plugin.handlerProcessors[handler.kind]?.baseHandlerKind;
      if (!baseHandler) {
        throw new Error(
          `handler type ${handler.kind} not found in processor for ${ds.kind}`,
        );
      }
      return baseHandler;
    }
  }

  private getBaseHandlerFilters<T extends SubqlSolanaHandlerFilter>(
    ds: SubqlSolanaDatasource,
    handlerKind: string,
  ): T[] {
    if (isCustomSolanaDs(ds)) {
      const plugin = this.dsProcessorService.getDsProcessor(ds);
      const processor = plugin.handlerProcessors[handlerKind];
      return processor.baseFilter instanceof Array
        ? (processor.baseFilter as T[])
        : ([processor.baseFilter] as T[]);
    } else {
      throw new Error(`expect custom datasource here`);
    }
  }
}
