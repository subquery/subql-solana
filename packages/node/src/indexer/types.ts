// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { SolanaBlock } from '@subql/types-solana';

export type BlockContent = SolanaBlock;

export function getBlockSize(block: BlockContent): number {
  throw new Error('Not implemented');
}
