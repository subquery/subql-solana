// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  BlockUnavailableError,
  Header,
  IBlockchainService,
  IStoreModelProvider,
  NodeConfig,
} from '@subql/node-core';
import { UnfinalizedBlocksService } from './unfinalizedBlocks.service';

const getMockStoreModelProvider = (): IStoreModelProvider => {
  const meta: Record<string, any> = {};

  return {
    metadata: {
      set: (key: string, value: any) => {
        meta[key] = value;
        return Promise.resolve();
      },
      find: (key) => Promise.resolve(meta[key]),
    },
    poi: null,
  } as any;
};

const headerFromHeight = (
  height: number,
  finalized = false,
  parentFinalized = false,
): Header => ({
  blockHeight: height,
  blockHash: `0x${height}${finalized ? 'f' : ''}`,
  parentHash: `0x${height - 1}${parentFinalized ? 'f' : ''}`,
  timestamp: new Date('2025-08-27T23:07:53.486Z'),
});

const getMockBlockchainService = (
  finalizedHeight = 100,
  skippedSlots: number[] = [],
): IBlockchainService & {
  setFinalizedHeight: (newHeight: number) => void;
  setSkippedSlots: (slots: number[]) => void;
} => {
  let _finalizedHeight = finalizedHeight;
  let _skippedSlots = new Set(skippedSlots);

  return {
    getFinalizedHeader: () =>
      Promise.resolve(headerFromHeight(_finalizedHeight, true)),
    getHeaderForHeight: (height: number) => {
      // Same behaviour as in SolanaApi
      if (_skippedSlots.has(height)) {
        // No block for that slot
        throw new BlockUnavailableError();
      }
      return Promise.resolve(
        headerFromHeight(
          height,
          height <= _finalizedHeight,
          height < _finalizedHeight,
        ),
      );
    },
    setFinalizedHeight: (newHeight: number) => (_finalizedHeight = newHeight),
    setSkippedSlots: (slots: number[]) => (_skippedSlots = new Set(slots)),
  } as any;
};

describe('Unfinalized blocks', () => {
  it('correctly detects forks', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(100);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    const reindex = jest.fn();
    await unfinalizedBlocks.init(reindex);

    let height = 101;
    const forkHeight = 108;
    while (height <= 110) {
      if (height === forkHeight) {
        blockchain.setFinalizedHeight(forkHeight);
        unfinalizedBlocks.registerFinalizedBlock(
          headerFromHeight(forkHeight, true, true),
        );
      }
      const rewindTo = await unfinalizedBlocks.processUnfinalizedBlockHeader(
        await blockchain.getHeaderForHeight(height),
      );
      if (rewindTo) {
        reindex(rewindTo);
        break;
      }
      height++;
    }

    expect(reindex).toHaveBeenCalledWith(headerFromHeight(100, true, true));
  });

  it('handles block forks when there are missed slots', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(100);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    const reindex = jest.fn();
    await unfinalizedBlocks.init(reindex);

    let height = 101;
    const forkHeight = 108;
    while (height <= 110) {
      if (height === forkHeight) {
        blockchain.setSkippedSlots([103]);
        blockchain.setFinalizedHeight(forkHeight);
        unfinalizedBlocks.registerFinalizedBlock(
          headerFromHeight(forkHeight, true, true),
        );
      }
      const rewindTo = await unfinalizedBlocks.processUnfinalizedBlockHeader(
        await blockchain.getHeaderForHeight(height),
      );
      if (rewindTo) {
        reindex(rewindTo);
        break;
      }
      height++;
    }

    expect(reindex).toHaveBeenCalledWith(headerFromHeight(100, true, true));
  });
});
