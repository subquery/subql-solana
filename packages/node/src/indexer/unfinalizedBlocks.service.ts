// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import assert from 'assert';
import { Inject, Injectable } from '@nestjs/common';
import {
  IBlockchainService,
  NodeConfig,
  getLogger,
  exitWithError,
  mainThreadOnly,
  ProofOfIndex,
  PoiBlock,
  IStoreModelProvider,
  Header,
  IBlock,
  IUnfinalizedBlocksService,
  BlockUnavailableError,
} from '@subql/node-core';
import { Transaction } from '@subql/x-sequelize';
import { isEqual, last } from 'lodash';
const logger = getLogger('UnfinalizedBlocks');

export const METADATA_UNFINALIZED_BLOCKS_KEY = 'unfinalizedBlocks';
export const METADATA_LAST_FINALIZED_PROCESSED_KEY =
  'lastFinalizedVerifiedHeight';

export const POI_NOT_ENABLED_ERROR_MESSAGE =
  'Poi is not enabled, unable to check for last finalized block';

const UNFINALIZED_THRESHOLD = 200;

type UnfinalizedBlocks = Header[];

type RecoveryProgress = {
  phase: string;
  startedAt: number;
  currentSlot?: number;
  headerRequests: number;
  skippedSlots: number;
};

// export interface IUnfinalizedBlocksService<B> extends IUnfinalizedBlocksServiceUtil {
//   init(reindex: (targetHeader: Header) => Promise<void>): Promise<Header | undefined>;
//   processUnfinalizedBlocks(block: IBlock<B> | undefined): Promise<Header | undefined>;
//   processUnfinalizedBlockHeader(header: Header | undefined): Promise<Header | undefined>;
//   resetUnfinalizedBlocks(tx?: Transaction): void;
//   resetLastFinalizedVerifiedHeight(tx?: Transaction): void;
//   getMetadataUnfinalizedBlocks(): Promise<UnfinalizedBlocks>;
// }

// export interface IUnfinalizedBlocksServiceUtil {
//   registerFinalizedBlock(header: Header): void;
// }

@Injectable()
export class UnfinalizedBlocksService<B = any>
  implements IUnfinalizedBlocksService<B>
{
  private _unfinalizedBlocks?: UnfinalizedBlocks;
  private _finalizedHeader?: Header;
  protected lastCheckedBlockHeight?: number;
  private recoveryProgress?: RecoveryProgress;

  @mainThreadOnly()
  private blockToHeader(block: IBlock<B>): Header {
    return block.getHeader();
  }

  protected get unfinalizedBlocks(): UnfinalizedBlocks {
    assert(
      this._unfinalizedBlocks !== undefined,
      new Error('Unfinalized blocks service has not been initialized'),
    );
    return this._unfinalizedBlocks;
  }

  protected get finalizedHeader(): Header {
    assert(
      this._finalizedHeader !== undefined,
      new Error('Unfinalized blocks service has not been initialized'),
    );
    return this._finalizedHeader;
  }

  constructor(
    protected readonly nodeConfig: NodeConfig,
    @Inject('IStoreModelProvider')
    protected readonly storeModelProvider: IStoreModelProvider,
    @Inject('IBlockchainService')
    protected blockchainService: IBlockchainService,
  ) {}

  async init(
    reindex: (tagetHeader: Header) => Promise<void>,
  ): Promise<Header | undefined> {
    logger.info(
      `Unfinalized blocks is ${
        this.nodeConfig.unfinalizedBlocks ? 'enabled' : 'disabled'
      }`,
    );

    logger.debug('Loading persisted unfinalized block metadata');
    this._unfinalizedBlocks = await this.getMetadataUnfinalizedBlocks();
    this.lastCheckedBlockHeight = await this.getLastFinalizedVerifiedHeight();
    logger.debug(
      `Loaded ${
        this.unfinalizedBlocks.length
      } unfinalized block(s), firstSlot=${
        this.unfinalizedBlocks[0]?.blockHeight ?? 'none'
      }, lastSlot=${
        last(this.unfinalizedBlocks)?.blockHeight ?? 'none'
      }, lastFinalizedVerifiedHeight=${this.lastCheckedBlockHeight ?? 'none'}`,
    );
    logger.debug(
      'Fetching finalized header before validating unfinalized blocks',
    );
    this._finalizedHeader = await this.blockchainService.getFinalizedHeader();
    logger.debug(
      `Finalized header: slot=${this.finalizedBlockNumber}, hash=${this.finalizedHeader.blockHash}`,
    );

    if (this.unfinalizedBlocks.length) {
      logger.info(
        `Processing unfinalized blocks: count=${
          this.unfinalizedBlocks.length
        }, firstSlot=${this.unfinalizedBlocks[0].blockHeight}, lastSlot=${
          last(this.unfinalizedBlocks)?.blockHeight
        }, finalizedSlot=${
          this.finalizedBlockNumber
        }, lastFinalizedVerifiedHeight=${
          this.lastCheckedBlockHeight ?? 'none'
        }`,
      );
      const progress: RecoveryProgress = (this.recoveryProgress = {
        phase: 'verify-chain',
        startedAt: Date.now(),
        headerRequests: 0,
        skippedSlots: 0,
      });
      // Keep startup progress visible at INFO level even when an RPC stalls.
      const progressTimer = setInterval(() => {
        logger.info(
          `Unfinalized recovery in progress: phase=${
            progress.phase
          }, currentSlot=${progress.currentSlot ?? 'none'}, headerRequests=${
            progress.headerRequests
          }, skippedSlots=${progress.skippedSlots}, elapsedMs=${
            Date.now() - progress.startedAt
          }`,
        );
      }, 10_000);
      progressTimer.unref();
      try {
        const rewindHeight = await this.processUnfinalizedBlocks();
        if (rewindHeight !== undefined) {
          progress.phase = 'reindex';
          progress.currentSlot = rewindHeight.blockHeight;
          logger.info(
            `Found un-finalized blocks from previous indexing but unverified, rolling back to last finalized block ${rewindHeight.blockHeight}`,
          );
          await reindex(rewindHeight);
          logger.info(
            `Successful rewind to block ${
              rewindHeight.blockHeight
            }! elapsedMs=${Date.now() - progress.startedAt}`,
          );
          return rewindHeight;
        } else {
          progress.phase = 'reset-metadata';
          progress.currentSlot = undefined;
          logger.debug(
            'Validation completed without a fork; resetting unfinalized metadata',
          );
          await this.resetUnfinalizedBlocks();
          await this.resetLastFinalizedVerifiedHeight();
          logger.info(
            `Unfinalized block validation completed: headerRequests=${
              progress.headerRequests
            }, skippedSlots=${progress.skippedSlots}, elapsedMs=${
              Date.now() - progress.startedAt
            }`,
          );
        }
      } finally {
        clearInterval(progressTimer);
        this.recoveryProgress = undefined;
      }
    }
  }

  private get finalizedBlockNumber(): number {
    return this.finalizedHeader.blockHeight;
  }

  async processUnfinalizedBlockHeader(
    header?: Header,
  ): Promise<Header | undefined> {
    let forkedHeader: Header | undefined;

    if (header) {
      forkedHeader = await this.registerUnfinalizedBlock(header);
    }

    forkedHeader ??= await this.hasForked();

    if (!forkedHeader) {
      // Remove blocks that are now confirmed finalized
      await this.deleteFinalizedBlock();
    } else {
      // Get the last unfinalized block that is now finalized
      return this.getLastCorrectFinalizedBlock(forkedHeader);
    }

    return;
  }

  async processUnfinalizedBlocks(
    block?: IBlock<B>,
  ): Promise<Header | undefined> {
    return this.processUnfinalizedBlockHeader(
      block ? this.blockToHeader(block) : undefined,
    );
  }

  registerFinalizedBlock(header: Header): void {
    if (
      this.finalizedHeader &&
      this.finalizedBlockNumber >= header.blockHeight
    ) {
      return;
    }
    this._finalizedHeader = header;
  }

  private async registerUnfinalizedBlock(
    header: Header,
  ): Promise<Header | undefined> {
    if (header.blockHeight <= this.finalizedBlockNumber) return;

    const lastUnfinalized = last(this.unfinalizedBlocks);
    const lastUnfinalizedHeight = lastUnfinalized?.blockHeight;
    if (
      lastUnfinalizedHeight !== undefined &&
      lastUnfinalizedHeight >= header.blockHeight
    ) {
      exitWithError(
        `Unfinalized block is not sequential, lastUnfinalizedBlock='${lastUnfinalizedHeight}', newUnfinalizedBlock='${header.blockHeight}'`,
        logger,
      );
    }

    if (!lastUnfinalized) {
      this.unfinalizedBlocks.push(header);
      await this.saveUnfinalizedBlocks(this.unfinalizedBlocks);
      return;
    }

    const lastProducedHeight = lastUnfinalized.blockHeight;
    if (lastProducedHeight + 1 !== header.blockHeight) {
      const forkedHeader = await this.backfillSkippedSlots(
        lastProducedHeight + 1,
        header.blockHeight - 1,
      );

      if (forkedHeader) {
        return forkedHeader;
      }
    }

    const latestUnfinalized = last(this.unfinalizedBlocks);
    if (
      latestUnfinalized &&
      header.parentHash !== latestUnfinalized.blockHash
    ) {
      logger.warn(
        `Block fork found, enqueued un-finalized block at ${header.blockHeight} with parent hash ${header.parentHash}, expected parent hash is ${latestUnfinalized.blockHash}.`,
      );
      return header;
    }

    this.unfinalizedBlocks.push(header);
    await this.saveUnfinalizedBlocks(this.unfinalizedBlocks);
    return;
  }

  private async backfillSkippedSlots(
    startHeight: number,
    endHeight: number,
  ): Promise<Header | undefined> {
    for (let height = startHeight; height <= endHeight; height++) {
      let header: Header;
      try {
        header = await this.blockchainService.getHeaderForHeight(height);
      } catch (e) {
        if (e instanceof BlockUnavailableError) {
          continue;
        }
        throw e;
      }

      const previousHeader = last(this.unfinalizedBlocks);
      if (previousHeader && header.parentHash !== previousHeader.blockHash) {
        logger.warn(
          `Block fork found while rebuilding un-finalized chain at ${header.blockHeight} with parent hash ${header.parentHash}, expected parent hash is ${previousHeader.blockHash}.`,
        );
        return header;
      }

      this.unfinalizedBlocks.push(header);
    }

    return;
  }

  private async deleteFinalizedBlock(): Promise<void> {
    if (
      this.lastCheckedBlockHeight !== undefined &&
      this.lastCheckedBlockHeight < this.finalizedBlockNumber
    ) {
      this.removeFinalized(this.finalizedBlockNumber);
      await this.saveLastFinalizedVerifiedHeight(this.finalizedBlockNumber);
      await this.saveUnfinalizedBlocks(this.unfinalizedBlocks);
    }
    this.lastCheckedBlockHeight = this.finalizedBlockNumber;
  }

  // remove any records less and equal than input finalized blockHeight
  private removeFinalized(blockHeight: number): void {
    this._unfinalizedBlocks = this.unfinalizedBlocks.filter(
      ({ blockHeight: height }) => height > blockHeight,
    );
  }

  // find closest record from block heights
  private getClosestRecord(blockHeight: number): Header | undefined {
    // Have the block in the best block, can be verified
    return [...this.unfinalizedBlocks] // Copy so we can reverse
      .reverse() // Reverse the list to find the largest block
      .find(({ blockHeight: height }) => height <= blockHeight);
  }

  // check unfinalized blocks for a fork, returns the header where a fork happened
  protected async hasForked(): Promise<Header | undefined> {
    const lastVerifiableBlock = this.getClosestRecord(
      this.finalizedBlockNumber,
    );

    // No unfinalized blocks
    if (!lastVerifiableBlock) {
      logger.debug(
        `No saved unfinalized block at or below finalized slot ${this.finalizedBlockNumber}`,
      );
      return;
    }

    logger.debug(
      `Checking saved block: slot=${lastVerifiableBlock.blockHeight}, hash=${
        lastVerifiableBlock.blockHash
      }, finalizedSlot=${this.finalizedBlockNumber}, slotGap=${
        this.finalizedBlockNumber - lastVerifiableBlock.blockHeight
      }`,
    );

    // Unfinalized blocks beyond finalized block
    if (lastVerifiableBlock.blockHeight === this.finalizedBlockNumber) {
      if (lastVerifiableBlock.blockHash !== this.finalizedHeader.blockHash) {
        logger.warn(
          `Block fork found, enqueued un-finalized block at ${lastVerifiableBlock.blockHeight} with hash ${lastVerifiableBlock.blockHash}, actual hash is ${this.finalizedHeader.blockHash}.`,
        );
        return this.finalizedHeader;
      }
    } else {
      // Unfinalized blocks below finalized block
      let header = this.finalizedHeader;
      /*
       * Iterate back through parent hashes until we get the header with the matching height
       * We use headers here rather than getBlockHash because of potential caching issues on the rpc
       * If we're off by a large number of blocks we can optimise by getting the block hash directly
       */
      if (
        header.blockHeight - lastVerifiableBlock.blockHeight >
        UNFINALIZED_THRESHOLD
      ) {
        logger.debug(
          `Verifying saved slot ${lastVerifiableBlock.blockHeight} with a direct header lookup`,
        );
        header = await this.getParentHeaderByHeight(
          lastVerifiableBlock.blockHeight,
        );
      } else {
        logger.debug(
          `Walking backward from finalized slot ${header.blockHeight} to saved slot ${lastVerifiableBlock.blockHeight}`,
        );
        while (header.blockHeight > lastVerifiableBlock.blockHeight) {
          assert(
            header.parentHash,
            'When iterate back parent hashes to find matching height, we expect parentHash to be exist',
          );
          // Solana doesn't support getting blocks by hash, so we use the previous block height
          header = await this.getParentHeaderByHeight(header.blockHeight - 1);
        }
      }

      if (
        header.blockHeight !== lastVerifiableBlock.blockHeight ||
        header.blockHash !== lastVerifiableBlock.blockHash
      ) {
        logger.warn(
          `Block fork found, enqueued un-finalized block at ${lastVerifiableBlock.blockHeight} with hash ${lastVerifiableBlock.blockHash}, actual block is at ${header.blockHeight} with hash ${header.blockHash}`,
        );
        return header;
      }
    }

    return;
  }

  protected async getLastCorrectFinalizedBlock(
    forkedHeader: Header,
  ): Promise<Header | undefined> {
    const bestVerifiableBlocks = this.unfinalizedBlocks.filter(
      ({ blockHeight }) => blockHeight <= this.finalizedBlockNumber,
    );

    let checkingHeader = forkedHeader;
    if (this.recoveryProgress) {
      this.recoveryProgress.phase = 'find-rewind-point';
    }
    logger.debug(
      `Searching for a rewind point: chainSlot=${
        checkingHeader.blockHeight
      }, savedCandidates=${
        bestVerifiableBlocks.length
      }, lastFinalizedVerifiedHeight=${this.lastCheckedBlockHeight ?? 'none'}`,
    );

    // Work backwards through the blocks until we find a matching hash
    for (const bestHeader of bestVerifiableBlocks.reverse()) {
      logger.debug(
        `Checking rewind candidate: savedSlot=${bestHeader.blockHeight}, savedHash=${bestHeader.blockHash}, chainSlot=${checkingHeader.blockHeight}`,
      );
      // Align heights before comparing hashes: a skipped saved slot must not
      // match a header from an earlier slot, even if its saved hash is identical.
      while (checkingHeader.blockHeight > bestHeader.blockHeight) {
        checkingHeader = await this.getParentHeaderByHeight(
          checkingHeader.blockHeight - 1,
        );
      }

      if (
        bestHeader.blockHeight === checkingHeader.blockHeight &&
        bestHeader.blockHash === checkingHeader.blockHash
      ) {
        logger.debug(
          `Matched rewind candidate at slot ${checkingHeader.blockHeight}, hash=${checkingHeader.blockHash}`,
        );
        return checkingHeader;
      }
    }

    if (
      this.lastCheckedBlockHeight === undefined ||
      this.lastCheckedBlockHeight === null
    ) {
      throw new Error(
        'Unable to find a verified finalized block to rewind to. Reindex the project to an earlier available slot.',
      );
    }

    logger.debug(
      `No saved header matched; checking last finalized checkpoint at slot ${this.lastCheckedBlockHeight}`,
    );
    return this.getParentHeaderByHeight(this.lastCheckedBlockHeight);
  }

  // Finds the last POI that had a correct block hash, this is used with the Eth sdk
  protected async findFinalizedUsingPOI(header: Header): Promise<Header> {
    const poiModel = this.storeModelProvider.poi;
    if (!poiModel) {
      throw new Error(POI_NOT_ENABLED_ERROR_MESSAGE);
    }

    let lastHeight = header.blockHeight;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const indexedBlocks: ProofOfIndex[] = await poiModel.getPoiBlocksBefore(
        lastHeight,
      );

      if (!indexedBlocks.length) {
        break;
      }

      // Work backwards to find a block on chain that matches POI
      for (const indexedBlock of indexedBlocks) {
        const chainHeader = await this.blockchainService.getHeaderForHeight(
          indexedBlock.id,
        );

        // Need to convert to PoiBlock to encode block hash to Uint8Array properly
        const testPoiBlock = PoiBlock.create(
          chainHeader.blockHeight,
          chainHeader.blockHash,
          new Uint8Array(),
          indexedBlock.projectId ?? '',
        );

        // Need isEqual because of Uint8Array type
        if (isEqual(testPoiBlock.chainBlockHash, indexedBlock.chainBlockHash)) {
          return chainHeader;
        }
      }

      // Next page of POI, use height rather than offset/limit as data could change in that time
      lastHeight = indexedBlocks[indexedBlocks.length - 1].id - 1;
    }

    throw new Error('Unable to find a POI block with matching block hash');
  }

  private async saveUnfinalizedBlocks(
    unfinalizedBlocks: UnfinalizedBlocks,
  ): Promise<void> {
    return this.storeModelProvider.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify(unfinalizedBlocks),
    );
  }

  private async saveLastFinalizedVerifiedHeight(height: number): Promise<void> {
    return this.storeModelProvider.metadata.set(
      METADATA_LAST_FINALIZED_PROCESSED_KEY,
      height,
    );
  }

  async resetUnfinalizedBlocks(tx?: Transaction): Promise<void> {
    await this.storeModelProvider.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      '[]',
      tx,
    );
    this._unfinalizedBlocks = [];
  }

  async resetLastFinalizedVerifiedHeight(tx?: Transaction): Promise<void> {
    return this.storeModelProvider.metadata.set(
      METADATA_LAST_FINALIZED_PROCESSED_KEY,
      null as any,
      tx,
    );
  }

  //string should be jsonb object
  async getMetadataUnfinalizedBlocks(): Promise<UnfinalizedBlocks> {
    const val = await this.storeModelProvider.metadata.find(
      METADATA_UNFINALIZED_BLOCKS_KEY,
    );
    if (val) {
      const result: (Header & { timestamp: string })[] = JSON.parse(val);
      return result.map(({ timestamp, ...header }) => ({
        ...header,
        timestamp: new Date(timestamp),
      }));
    }
    return [];
  }

  async getLastFinalizedVerifiedHeight(): Promise<number | undefined> {
    return this.storeModelProvider.metadata.find(
      METADATA_LAST_FINALIZED_PROCESSED_KEY,
    );
  }

  // Solana does not support getBlockHash and can skip blocks, so we work backwards
  private async getParentHeaderByHeight(height: number): Promise<Header> {
    for (let slot = height; slot >= 0; slot--) {
      const startedAt = Date.now();
      if (this.recoveryProgress) {
        this.recoveryProgress.currentSlot = slot;
        this.recoveryProgress.headerRequests++;
      }
      logger.debug(
        `Requesting Solana header for slot ${slot} while verifying unfinalized blocks (searchStartSlot=${height})`,
      );
      try {
        const header = await this.blockchainService.getHeaderForHeight(slot);
        logger.debug(
          `Received Solana header: requestedSlot=${slot}, blockSlot=${
            header.blockHeight
          }, hash=${header.blockHash}, parentHash=${
            header.parentHash
          }, elapsedMs=${Date.now() - startedAt}`,
        );
        return header;
      } catch (e) {
        if (!(e instanceof BlockUnavailableError)) {
          logger.error(
            e instanceof Error ? e : new Error(String(e)),
            `Solana header lookup failed: slot=${slot}, elapsedMs=${
              Date.now() - startedAt
            }`,
          );
          throw e;
        }
        if (this.recoveryProgress) {
          this.recoveryProgress.skippedSlots++;
        }
        logger.debug(
          `Skipping unavailable Solana slot ${slot} while verifying unfinalized blocks, elapsedMs=${
            Date.now() - startedAt
          }`,
        );
      }
    }
    throw new Error(
      `Unable to find an available Solana block at or below slot ${height}`,
    );
  }
}
