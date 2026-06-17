// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_LONG_TERM_STORAGE_SLOT_SKIPPED,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SLOT_SKIPPED,
  SolanaError,
} from '@solana/errors';
import { BlockUnavailableError } from '@subql/node-core';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';

jest.mock('@solana/rpc', () => ({
  createSolanaRpc: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSolanaRpc } = require('@solana/rpc');

function mockRpcClient(getBlockError: unknown) {
  return {
    getGenesisHash: () => ({ send: () => Promise.resolve('genesis-hash') }),
    getBlock: () => ({ send: () => Promise.reject(getBlockError) }),
  };
}

describe('SolanaApi skipped slot handling', () => {
  const eventEmitter = new EventEmitter2();
  const decoder = new SolanaDecoder();

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

  it('does not treat LONG_TERM_STORAGE_SLOT_SKIPPED as a skip when disabled via endpoint config', async () => {
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
      {
        treatLongTermStorageSkipAsSkipped: false,
      },
    );
    await expect(api.fetchBlock(1)).rejects.toBe(rpcError);
  });
});
