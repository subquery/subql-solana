// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { SolanaBlock } from '@subql/types-solana';

export type BlockContent = SolanaBlock;

export function getBlockSize(block: BlockContent): number {
  return block.transactions
    .map((tx) => Buffer.byteLength(JSON.stringify(tx), 'utf8'))
    .reduce((acc, value) => acc + value, 0);
}
