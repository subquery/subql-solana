// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { BlockUnavailableError } from '@subql/node-core';
import { SolanaApi } from './api.solana';

describe('SolanaApi errors', () => {
  it('normalises skipped slots to BlockUnavailableError', () => {
    const error = new Error(
      'Slot 394555688 was skipped, or missing due to ledger jump to recent snapshot',
    );

    expect(SolanaApi.prototype.handleError.call({}, error)).toBeInstanceOf(
      BlockUnavailableError,
    );
  });
});
