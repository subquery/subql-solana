// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { solanaBlockToHeader, transformBlock } from './block.solana';
import { SolanaDecoder } from './decoder';

const mockBlock = {
  blockHeight: 10n,
  blockTime: 1_744_000_000n,
  blockhash: 'block-hash',
  parentSlot: 12n,
  previousBlockhash: 'parent-hash',
  transactions: [],
} as any;

describe('Solana block utils', () => {
  it('uses the fetched slot as the header height', () => {
    expect(solanaBlockToHeader(mockBlock, 15).blockHeight).toBe(15);
  });

  it('preserves the fetched slot through transformed blocks', () => {
    const block = transformBlock(mockBlock, new SolanaDecoder(), 15);

    expect(solanaBlockToHeader(block).blockHeight).toBe(15);
    expect(Object.getOwnPropertyNames(block)).not.toContain('slot');
  });
});
