// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import type { UnixTimestamp, Blockhash, Slot, TransactionForFullJson } from '@solana/rpc-types';
import type { Header, IBlock } from '@subql/node-core';
import type { SolanaBlock, BaseSolanaBlock, SolanaInstruction } from '@subql/types-solana';


type RawSolanaBlock = Readonly<{
  /** The number of blocks beneath this block */
  blockHeight: bigint;
  /** Estimated production time, as Unix timestamp */
  blockTime: UnixTimestamp;
  /** the blockhash of this block */
  blockhash: Blockhash;
  /** The slot index of this block's parent */
  parentSlot: Slot;
  /** The blockhash of this block's parent */
  previousBlockhash: Blockhash;

  transactions: readonly TransactionForFullJson<void>[]
}>;

function wrapInstruction(
  instruction: Omit<SolanaInstruction, "transaction">,
  transaction: TransactionForFullJson<void>
): SolanaInstruction {
  // XXX if we make this fully circular toJSON will need to be added to omit the transaction on the instruction
  return ({
    ...instruction,
    transaction,
  })
}

/**
 * Transforms a block from a raw response to the types injected into handlers*/
export function transformBlock(block: RawSolanaBlock): SolanaBlock {
  return {
    ...block,
    transactions: block.transactions.map(tx => ({
      ...tx,
      transaction: {
        ...tx.transaction,
        message: {
          ...tx.transaction.message,

          instructions: tx.transaction.message.instructions.map(instruction => wrapInstruction(instruction, tx))
        },
      },
      meta: tx.meta ? {
        ...tx.meta,
        innerInstructions: tx.meta?.innerInstructions.map(innerInstruction => ({
          ...innerInstruction,
          instructions: innerInstruction.instructions.map(instruction => wrapInstruction(instruction, tx))
        }))
      } : null
    }))
  }
}

export function formatBlockUtil<
  B extends SolanaBlock = SolanaBlock,
>(block: B): IBlock<B> {
  return {
    block,
    getHeader: () => solanaBlockToHeader(block),
  };
}

export function solanaBlockToHeader(block: BaseSolanaBlock): Header {
  return {
    blockHeight: Number(block.blockHeight),
    blockHash: block.blockhash,
    parentHash: block.previousBlockhash,
    timestamp: new Date(Number(block.blockTime) * 1000), // TODO test
  };
}

