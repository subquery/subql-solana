// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { TransactionForFullJson } from '@solana/kit';
import { filterBlockTimestamp } from '@subql/node-core';
import {
  SolanaLogMessage,
  SolanaBlock,
  SolanaBlockFilter,
  SolanaInstruction,
  SolanaInstructionFilter,
  SolanaLogFilter,
  SolanaTransaction,
  SolanaTransactionFilter,
} from '@subql/types-solana';
import bs58 from 'bs58';
import { SubqlProjectBlockFilter } from '../configure/SubqueryProject';
import { SolanaDecoder } from './decoder';

function allAccounts(
  transaction: SolanaTransaction | TransactionForFullJson<0>,
) {
  return [
    ...transaction.transaction.message.accountKeys,
    ...(transaction.meta?.loadedAddresses.writable ?? []),
    ...(transaction.meta?.loadedAddresses.readonly ?? []),
  ];
}

function getAccountByIndex(
  instruction: SolanaInstruction,
  index: number,
): string {
  return allAccounts(instruction.transaction)[index];
}

export function getProgramId(instruction: SolanaInstruction): string {
  return getAccountByIndex(instruction, instruction.programIdIndex);
}

export function filterBlocksProcessor(
  block: SolanaBlock,
  filter: SolanaBlockFilter,
): boolean {
  if (filter?.modulo && Number(block.blockHeight) % filter.modulo !== 0) {
    return false;
  }
  // Multiply to add MS
  if (
    !filterBlockTimestamp(
      Number(block.blockTime) * 1000,
      filter as SubqlProjectBlockFilter,
    )
  ) {
    return false;
  }
  return true;
}

export function filterTransactionsProcessor(
  transaction: SolanaTransaction,
  filter?: SolanaTransactionFilter,
): boolean {
  if (!filter) return true;

  if (filter.signerAccountKey) {
    // The signature at index i corresponds to the public key at index i in message.accountKeys
    const sigAccounts = transaction.transaction.signatures.map(
      (sig, idx) => transaction.transaction.message.accountKeys[idx],
    );
    if (!sigAccounts.some((account) => account === filter.signerAccountKey)) {
      return false;
    }
  }

  return true;
}

export function filterInstructionsProcessor(
  instruction: SolanaInstruction,
  // idls?: Map<string, Idl>,
  decoder: SolanaDecoder,
  filter?: SolanaInstructionFilter,
): boolean {
  if (!filter) return true;

  const programId = getProgramId(instruction);
  if (filter.programId) {
    if (filter.programId !== programId) {
      return false;
    }
  }

  console.log('PROGRAM MATCH');

  if (filter.discriminator) {
    const discriminator = decoder.parseDiscriminator(
      filter.discriminator,
      programId,
    );
    const data = bs58.decode(instruction.data);

    if (data.indexOf(discriminator) !== 0) {
      return false;
    }
  }

  console.log('DISCRIMINATOR MATCH');

  if (filter.accounts) {
    const accounts = instruction.transaction.transaction.message.accountKeys;
    for (let i = 0; i < filter.accounts.length; i++) {
      const filterAccounts = filter.accounts[i];
      if (!filterAccounts) {
        continue;
      }
      const instructionAccountIndex = instruction.accounts[i];
      if (!filterAccounts.includes(accounts[instructionAccountIndex])) {
        return false;
      }
    }
  }

  return true;
}

export function filterLogsProcessor(
  log: SolanaLogMessage,
  // idls?: Map<string, Idl>,
  filter?: SolanaLogFilter,
): boolean {
  if (!filter) return true;

  if (filter.programId && filter.programId !== log.programId) {
    return false;
  }

  // if (filter.name) {
  //   const disc = getAnchorDiscriminator(filter.name, 'event');
  //   const disc58 = bs58.encode(disc)
  //   if (!instruction.data.startsWith(disc58)) {
  //     return false;
  //   }
  // }

  // TODO parse log data

  return true;
}
