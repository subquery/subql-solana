// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { DictionaryV2QueryEntry } from '@subql/node-core';

export type RawSolanaBlock = unknown;

/**
 * Solana dictionary RPC request filter conditions
 */
export interface SolanaDictionaryV2QueryEntry extends DictionaryV2QueryEntry {
  logs?: SolanaDictionaryLogConditions[];
  instructions?: SolanaDictionaryInstructionConditions[];
  transactions?: SolanaDictionaryTxConditions[];
}

export interface SolanaDictionaryLogConditions {
  programIds?: string[];
}

export interface SolanaDictionaryTxConditions {
  signerAccountKeys?: string[];
}

export interface SolanaDictionaryInstructionConditions {
  programIds?: string[];
  accounts?: (string[] | null)[];
  isCommitted?: boolean;
}
