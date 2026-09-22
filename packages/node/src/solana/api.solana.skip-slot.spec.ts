// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SLOT_SKIPPED,
  SolanaError,
} from '@solana/errors';
import { BlockUnavailableError, IBlock } from '@subql/node-core';
import { SolanaBlock } from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';

jest.mock('@solana/rpc', () => ({
  createSolanaRpc: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSolanaRpc } = require('@solana/rpc');

function mockRpcClient(
  getBlockError: unknown,
  availableSlots: bigint[] = [1n],
) {
  return {
    getGenesisHash: () => ({ send: () => Promise.resolve('genesis-hash') }),
    getBlock: () => ({ send: () => Promise.reject(getBlockError) }),
    getBlocks: () => ({ send: () => Promise.resolve(availableSlots) }),
  };
}

describe('SolanaApi skipped slot handling', () => {
  const eventEmitter = new EventEmitter2();
  const decoder = new SolanaDecoder();

  it('filters skipped slots with getBlocks before calling getBlock', async () => {
    const getBlock = jest.fn();
    const getBlocks = jest.fn(() => ({
      send: () => Promise.resolve([]),
    }));
    createSolanaRpc.mockReturnValue({
      getGenesisHash: () => ({ send: () => Promise.resolve('genesis-hash') }),
      getBlock,
      getBlocks,
    });

    const api = await SolanaApi.create(
      'http://localhost',
      eventEmitter,
      decoder,
    );

    await expect(api.fetchBlocks([1])).resolves.toEqual([]);
    expect(getBlocks).toHaveBeenCalledWith(1n, 1n, {
      commitment: 'confirmed',
    });
    expect(getBlock).not.toHaveBeenCalled();
  });

  it('fetches only requested slots returned by getBlocks', async () => {
    createSolanaRpc.mockReturnValue(mockRpcClient(undefined, [1n]));
    const api = await SolanaApi.create(
      'http://localhost',
      eventEmitter,
      decoder,
    );
    const block = {} as IBlock<SolanaBlock>;
    const fetchBlock = jest.spyOn(api, 'fetchBlock').mockResolvedValue(block);

    await expect(api.fetchBlocks([1, 2])).resolves.toEqual([block]);
    expect(fetchBlock).toHaveBeenCalledTimes(1);
    expect(fetchBlock).toHaveBeenCalledWith(1);
  });

  it('treats SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SLOT_SKIPPED as a confirmed skip', async () => {
    createSolanaRpc.mockReturnValue(
      mockRpcClient(
        new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SLOT_SKIPPED, {
          __serverMessage: 'Slot 1 was skipped',
        }),
      ),
    );
    const api = await SolanaApi.create(
      'http://localhost',
      eventEmitter,
      decoder,
    );
    await expect(api.fetchBlock(1)).rejects.toBeInstanceOf(
      BlockUnavailableError,
    );
  });

  it('treats LONG_TERM_STORAGE_SLOT_SKIPPED as a skip by default', async () => {
    createSolanaRpc.mockReturnValue(
      mockRpcClient(
        new SolanaError(
          SOLANA_ERROR__JSON_RPC__SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
          {
            __serverMessage:
              'Slot 1 was skipped, or missing in long-term storage',
          },
        ),
      ),
    );
    const api = await SolanaApi.create(
      'http://localhost',
      eventEmitter,
      decoder,
    );
    await expect(api.fetchBlock(1)).rejects.toBeInstanceOf(
      BlockUnavailableError,
    );
  });

  it('does not treat LONG_TERM_STORAGE_SLOT_SKIPPED as a skip when disabled at startup', async () => {
    const rpcError = new SolanaError(
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
      {
        __serverMessage: 'Slot 1 was skipped, or missing in long-term storage',
      },
    );
    createSolanaRpc.mockReturnValue(mockRpcClient(rpcError));
    const api = await SolanaApi.create(
      'http://localhost',
      eventEmitter,
      decoder,
      undefined,
      false,
    );
    await expect(api.fetchBlock(1)).rejects.toBe(rpcError);
  });
});
