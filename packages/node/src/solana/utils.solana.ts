// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  Program,
  BorshInstructionCoder,
  BorshEventCoder,
  Idl,
} from '@coral-xyz/anchor';
import { sha256 } from '@noble/hashes/sha256'; // This is a transient dep from '@coral-xyz/anchor'
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
import { isHex } from '@subql/utils';
import bs58 from 'bs58';
import { SubqlProjectBlockFilter } from '../configure/SubqueryProject';
import { SolanaApi } from './api.solana';

function getAccountByIndex(
  instruction: SolanaInstruction,
  index: number,
): string {
  return instruction.transaction.transaction.message.accountKeys[index];
}
function getProgramId(instruction: SolanaInstruction): string {
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
  filter?: SolanaInstructionFilter,
): boolean {
  if (!filter) return true;

  if (filter.programId) {
    if (filter.programId !== getProgramId(instruction)) {
      return false;
    }
  }

  // This is only working with Anchor programs currently
  if (filter.discriminator) {
    const discAnchor = getAnchorDiscriminator(filter.discriminator);
    const dataDiscriminator = bs58.decode(instruction.data).subarray(0, 8);
    let b58disc: Buffer | undefined;
    try {
      bs58.decode(filter.discriminator);
    } catch (e) {
      // Do nothing
    }

    if (
      !dataDiscriminator.equals(discAnchor) ||
      (!!b58disc && dataDiscriminator.equals(b58disc))
    ) {
      return false;
    }
  }

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

const idlCache = new Map<string, Idl>();

// TODO memoize this
export function getAnchorDiscriminator(
  name: string,
  namespace = 'global',
): Buffer {
  if (isHex(`0x${name}`)) {
    return Buffer.from(name, 'hex');
  }

  const preimage = (name as string).startsWith(namespace)
    ? name
    : `${namespace}:${name}`;

  const hash = sha256(preimage);
  const discriminator = Buffer.from(hash).subarray(0, 8);
  return discriminator;
}

async function getIdl(api: SolanaApi, programId: string): Promise<Idl> {
  let idl = idlCache.get(programId);
  if (idl) {
    return idl;
  }
  idl =
    (await Program.fetchIdl(programId, { connection: api as any })) ??
    undefined;

  if (!idl) {
    throw new Error(`Failed to resolve IDL from network for ${programId}`);
  }

  idlCache.set(programId, idl);
  return idl;
}

// TODO why would this be null?
// TODO how do we get a connection, were using @solana/kit not @solana/web3.js
export async function decodeInstruction<T = any>(
  api: SolanaApi,
  instruction: SolanaInstruction,
  idl?: Idl,
): Promise<{ name: string; data: T } | null> {
  if (!idl) {
    const programId = getProgramId(instruction);

    idl = await getIdl(api, programId);
  }

  const coder = new BorshInstructionCoder(idl);
  return coder.decode(instruction.data, 'base58') as {
    name: string;
    data: T;
  } | null;
}

export async function decodeLog<T = any>(
  api: SolanaApi,
  log: string,
  idl?: Idl,
  programId?: string,
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
