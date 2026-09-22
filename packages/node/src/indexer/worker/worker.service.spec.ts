// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { BlockUnavailableError } from '@subql/node-core';
import { WorkerService } from './worker.service';

describe('WorkerService skipped slot handling', () => {
  it('converts an empty fetch result into BlockUnavailableError', async () => {
    const worker = Object.create(WorkerService.prototype) as {
      apiService: { fetchBlocks: jest.Mock };
      fetchChainBlock: (
        height: number,
        extra: Record<string, never>,
      ) => Promise<unknown>;
    };
    worker.apiService = {
      fetchBlocks: jest.fn().mockResolvedValue([]),
    };

    await expect(worker.fetchChainBlock(100, {})).rejects.toBeInstanceOf(
      BlockUnavailableError,
    );
    expect(worker.apiService.fetchBlocks).toHaveBeenCalledWith([100]);
  });
});
