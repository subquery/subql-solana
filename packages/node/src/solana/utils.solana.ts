// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Program, BorshInstructionCoder, BorshEventCoder, Idl } from "@coral-xyz/anchor";
import { filterBlockTimestamp } from '@subql/node-core';
import {
  SolanaBlock,
  SolanaBlockFilter,
  SolanaInstruction,
  SolanaInstructionFilter,
  SolanaTransaction,
  SolanaTransactionFilter,
} from '@subql/types-solana';
import { SubqlProjectBlockFilter } from '../configure/SubqueryProject';
import { SolanaApi } from "./api.solana";


function getProgramId(instruction: SolanaInstruction): string {
  return instruction.transaction.transaction.message.accountKeys[instruction.programIdIndex];
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
    const sigAccounts = transaction.transaction.signatures.map((sig, idx) => transaction.transaction.message.accountKeys[idx]);
    if (!sigAccounts.some(account => account === filter.signerAccountKey)) {
      return false;
    }
  }

  return true;
}

export function filterInstructionsProcessor(
  instruction: SolanaInstruction,
  filter?: SolanaInstructionFilter
): boolean {
  if (!filter) return true;

  if (filter.programId) {
    if (filter.programId !== getProgramId(instruction)) {
      return false;
    }
  }

  // TODO parse instruction data

  return true;
}

const idlCache = new Map<string, Idl>();

async function getIdl(api: SolanaApi, programId: string): Promise<Idl> {
  let idl = idlCache.get(programId);
  if (idl) {
    return idl;
  }
  idl = await Program.fetchIdl(programId, { connection: api as any }) ?? undefined;

  if (!idl) {
    throw new Error(`Failed to resolve IDL from network for ${programId}`)
  }

  idlCache.set(programId, idl);
  return idl
}

// TODO why would this be null?
// TODO how do we get a connection, were using @solana/kit not @solana/web3.js
export async function decodeInstruction<T = any>(api: SolanaApi, instruction: SolanaInstruction, idl?: Idl): Promise<{ name: string; data: T; } | null> {
  if (!idl) {
    const programId = getProgramId(instruction);

    idl = await getIdl(api, programId)
  }

  const coder = new BorshInstructionCoder(idl);
  return coder.decode(instruction.data, 'base58') as { name: string; data: T; } | null;
}

export async function decodeLog<T = any>(
  api: SolanaApi,
  log: string,
  idl?: Idl,
  programId?: string
): Promise<{ name: string; data: T } | null> {
  if (!idl) {
    if (!programId) {
      throw new Error('No IDL or programId provided, unable to decode log');
    }
    idl = await getIdl(api, programId);
  }

  const coder = new BorshEventCoder(idl);

  return coder.decode(log.replace('Program data:', '').trim());
}
