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
  parentHeight = height - 1,
): Header => ({
  blockHeight: height,
  blockHash: `0x${height}${finalized ? 'f' : ''}`,
  parentHash: `0x${parentHeight}${parentFinalized ? 'f' : ''}`,
  timestamp: new Date('2025-08-27T23:07:53.486Z'),
});

const getPreviousProducedSlot = (
  height: number,
  skippedSlots: Set<number>,
): number => {
  let parentHeight = height - 1;
  while (skippedSlots.has(parentHeight)) {
    parentHeight--;
  }
  return parentHeight;
};

const getMockBlockchainService = (
  finalizedHeight = 100,
  skippedSlots: number[] = [],
): IBlockchainService & {
  setFinalizedHeight: (newHeight: number) => void;
  setForkedParent: (height: number, parentHash: string) => void;
  setSkippedSlots: (slots: number[]) => void;
} => {
  let _finalizedHeight = finalizedHeight;
  let _skippedSlots = new Set(skippedSlots);
  const _forkedParents = new Map<number, string>();

  return {
    getFinalizedHeader: () =>
      Promise.resolve(
        headerFromHeight(
          _finalizedHeight,
          true,
          true,
          getPreviousProducedSlot(_finalizedHeight, _skippedSlots),
        ),
      ),
    getHeaderForHeight: (height: number) => {
      // Same behaviour as in SolanaApi
      if (_skippedSlots.has(height)) {
        // No block for that slot
        throw new BlockUnavailableError();
      }
      const parentHeight = getPreviousProducedSlot(height, _skippedSlots);
      const header = headerFromHeight(
        height,
        height <= _finalizedHeight,
        parentHeight < _finalizedHeight,
        parentHeight,
      );
      const forkedParent = _forkedParents.get(height);
      if (forkedParent) {
        header.parentHash = forkedParent;
      }
      return Promise.resolve(header);
    },
    setFinalizedHeight: (newHeight: number) => (_finalizedHeight = newHeight),
    setForkedParent: (height: number, parentHash: string) =>
      _forkedParents.set(height, parentHash),
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
    const blockchain = getMockBlockchainService(100, [103]);
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
          await blockchain.getHeaderForHeight(forkHeight),
        );
      }
      let header: Header;
      try {
        header = await blockchain.getHeaderForHeight(height);
      } catch (e) {
        if (e instanceof BlockUnavailableError) {
          height++;
          continue;
        }
        throw e;
      }
      const rewindTo = await unfinalizedBlocks.processUnfinalizedBlockHeader(
        header,
      );
      if (rewindTo) {
        reindex(rewindTo);
        break;
      }
      height++;
    }

    expect(reindex).toHaveBeenCalledWith(headerFromHeight(100, true, true));
  });

  it('rebuilds the parent chain across actual and skipped slots', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(100, [103]);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    await unfinalizedBlocks.init(jest.fn());

    await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(101),
    );
    await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(105),
    );

    expect((unfinalizedBlocks as any).unfinalizedBlocks).toMatchObject([
      await blockchain.getHeaderForHeight(101),
      await blockchain.getHeaderForHeight(102),
      await blockchain.getHeaderForHeight(104),
      await blockchain.getHeaderForHeight(105),
    ]);
  });

  it('rolls back when a backfilled slot has the wrong parent hash', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(100);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    await unfinalizedBlocks.init(jest.fn());
    await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(101),
    );

    blockchain.setForkedParent(102, '0xfork');
    const rewindTo = await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(105),
    );

    expect(rewindTo).toMatchObject(headerFromHeight(100, true, true));
  });

  it('rolls back when a new block does not connect after skipped slots', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(100, [103]);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    await unfinalizedBlocks.init(jest.fn());
    await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(101),
    );

    blockchain.setForkedParent(105, '0xfork');
    const rewindTo = await unfinalizedBlocks.processUnfinalizedBlockHeader(
      await blockchain.getHeaderForHeight(105),
    );

    expect(rewindTo).toMatchObject(headerFromHeight(100, true, true));
  });
});
