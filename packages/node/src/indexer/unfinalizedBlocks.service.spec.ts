// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  BlockUnavailableError,
  Header,
  IBlockchainService,
  IStoreModelProvider,
  NodeConfig,
} from '@subql/node-core';
import {
  METADATA_LAST_FINALIZED_PROCESSED_KEY,
  METADATA_UNFINALIZED_BLOCKS_KEY,
  UnfinalizedBlocksService,
} from './unfinalizedBlocks.service';

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
  it.each([true, false])(
    'cleans up startup progress reporting when header lookup succeeds=%s',
    async (succeeds) => {
      jest.useFakeTimers();
      try {
        const initialTimers = jest.getTimerCount();
        const store = getMockStoreModelProvider();
        const blockchain = getMockBlockchainService(500);
        const header = headerFromHeight(103, true, true);
        await store.metadata.set(
          METADATA_UNFINALIZED_BLOCKS_KEY,
          JSON.stringify([header]),
        );
        let completeRequest!: (result: Header) => void;
        let rejectRequest!: (error: Error) => void;
        const pendingHeader = new Promise<Header>((resolve, reject) => {
          completeRequest = resolve;
          rejectRequest = reject;
        });
        let notifyRequestStarted!: () => void;
        const requestStarted = new Promise<void>((resolve) => {
          notifyRequestStarted = resolve;
        });
        jest.spyOn(blockchain, 'getHeaderForHeight').mockImplementation(() => {
          notifyRequestStarted();
          return pendingHeader;
        });
        const unfinalizedBlocks = new UnfinalizedBlocksService(
          new NodeConfig({} as any),
          store,
          blockchain,
        );
        const initialization = unfinalizedBlocks.init(jest.fn());
        const failure = new Error('RPC failed during recovery');
        const outcome = initialization.catch((error: Error) => error);
        await requestStarted;
        expect(jest.getTimerCount()).toBe(initialTimers + 1);
        jest.advanceTimersByTime(10_000);

        if (succeeds) {
          completeRequest(header);
        } else {
          rejectRequest(failure);
        }

        expect(await outcome).toBe(succeeds ? undefined : failure);
        expect(jest.getTimerCount()).toBe(initialTimers);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each([105, 500])(
    'recovers a skipped saved slot when finalized height is %i',
    async (finalizedHeight) => {
      const store = getMockStoreModelProvider();
      const blockchain = getMockBlockchainService(finalizedHeight, [103]);
      await store.metadata.set(
        METADATA_UNFINALIZED_BLOCKS_KEY,
        JSON.stringify([
          headerFromHeight(101, true, true),
          // Simulate stale metadata assigning a real block hash to a skipped slot.
          { ...headerFromHeight(102, true, true), blockHeight: 103 },
        ]),
      );
      await store.metadata.set(METADATA_LAST_FINALIZED_PROCESSED_KEY, 100);
      const unfinalizedBlocks = new UnfinalizedBlocksService(
        new NodeConfig({} as any),
        store,
        blockchain,
      );
      const reindex = jest.fn();

      const rewindTo = await unfinalizedBlocks.init(reindex);

      expect(rewindTo).toEqual(headerFromHeight(101, true, true));
      expect(reindex).toHaveBeenCalledTimes(1);
      expect(reindex).toHaveBeenCalledWith(rewindTo);
    },
  );

  it('skips an unavailable last verified checkpoint when recovering a fork', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(500, [100, 103]);
    await store.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify([headerFromHeight(103)]),
    );
    await store.metadata.set(METADATA_LAST_FINALIZED_PROCESSED_KEY, 100);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );
    const reindex = jest.fn();

    const rewindTo = await unfinalizedBlocks.init(reindex);

    expect(rewindTo).toEqual(headerFromHeight(99, true, true));
    expect(reindex).toHaveBeenCalledWith(rewindTo);
  });

  it('does not rewind an unchanged saved chain with skipped slots between blocks', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(500, [102]);
    await store.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify([
        await blockchain.getHeaderForHeight(101),
        await blockchain.getHeaderForHeight(103),
      ]),
    );
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );
    const reindex = jest.fn();

    await expect(unfinalizedBlocks.init(reindex)).resolves.toBeUndefined();

    expect(reindex).not.toHaveBeenCalled();
    expect(await unfinalizedBlocks.getMetadataUnfinalizedBlocks()).toEqual([]);
  });

  it('propagates RPC failures instead of treating them as skipped slots', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(500);
    await store.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify([headerFromHeight(103)]),
    );
    const failure = new Error('RPC unavailable');
    jest.spyOn(blockchain, 'getHeaderForHeight').mockRejectedValue(failure);
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );
    const reindex = jest.fn();

    await expect(unfinalizedBlocks.init(reindex)).rejects.toBe(failure);
    expect(reindex).not.toHaveBeenCalled();
  });

  it('stops at genesis when no earlier block is available', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(500);
    await store.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify([headerFromHeight(1)]),
    );
    const fetchHeader = jest
      .spyOn(blockchain, 'getHeaderForHeight')
      .mockRejectedValue(new BlockUnavailableError());
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );

    await expect(unfinalizedBlocks.init(jest.fn())).rejects.toThrow(
      'Unable to find an available Solana block at or below slot 1',
    );
    expect(fetchHeader.mock.calls).toEqual([[1], [0]]);
  });

  it('keeps unverified metadata when there is no safe rewind checkpoint', async () => {
    const store = getMockStoreModelProvider();
    const blockchain = getMockBlockchainService(500, [103]);
    const savedHeaders = [headerFromHeight(103)];
    await store.metadata.set(
      METADATA_UNFINALIZED_BLOCKS_KEY,
      JSON.stringify(savedHeaders),
    );
    const unfinalizedBlocks = new UnfinalizedBlocksService(
      new NodeConfig({} as any),
      store,
      blockchain,
    );
    const reindex = jest.fn();

    await expect(unfinalizedBlocks.init(reindex)).rejects.toThrow(
      'Unable to find a verified finalized block to rewind to',
    );
    expect(reindex).not.toHaveBeenCalled();
    expect(await unfinalizedBlocks.getMetadataUnfinalizedBlocks()).toEqual(
      savedHeaders,
    );
  });

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
