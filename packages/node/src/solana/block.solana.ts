// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import type {
  UnixTimestamp,
  Blockhash,
  Slot,
  TransactionForFullJson,
} from '@solana/rpc-types';
import { getLogger, type Header, type IBlock } from '@subql/node-core';
import type {
  SolanaBlock,
  BaseSolanaBlock,
  SolanaInstruction,
  DecodedData,
  SolanaLogMessage,
} from '@subql/types-solana';
import { SolanaDecoder } from './decoder';

const logger = getLogger('SolanaBlock');

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

  transactions: readonly TransactionForFullJson<0>[];
}>;

// We use this function to omit properties without accessing getters
function omit<T>(input: T, omit: (keyof T)[]) {
  const json: Record<string, any> = {};

  for (const key of Object.getOwnPropertyNames(input)) {
    if (!omit.includes(key as keyof T)) {
      json[key] = (input as any)[key];
    }
  }

  return json;
}

function wrapInstruction(
  index: number[],
  instruction: Omit<
    SolanaInstruction,
    'index' | 'block' | 'transaction' | 'decodedData'
  >,
  transaction: TransactionForFullJson<0>,
  block: BaseSolanaBlock,
  decoder: SolanaDecoder,
): SolanaInstruction {
  let pendingDecode: Promise<DecodedData | null>;
  // XXX if we make this fully circular toJSON will need to be added to omit the transaction on the instruction
  const res = {
    ...instruction,
    index,
    transaction,
    block,
    get decodedData(): Promise<DecodedData | null> {
      pendingDecode ??= decoder.decodeInstruction(this);
      return pendingDecode;
    },
  };

  // Implement this in order to calculate block size
  (res as any).toJSON = () => {
    return omit(res, ['block', 'decodedData', 'transaction']);
  };

  return res;
}

export function wrapLogs(
  logs: readonly string[] | null,
  decoder: SolanaDecoder,
): SolanaLogMessage[] | null {
  if (logs === null) {
    return null;
  }
  const res: SolanaLogMessage[] = [];

  // Keep a stack of the instruction programs
  const instructionPath: string[] = [];

  for (const [idx, log] of Object.entries(logs)) {
    let pendingDecode: Promise<DecodedData | null>;
    if (log.startsWith('Program log:')) {
      res.push({
        message: log,
        programId: instructionPath[instructionPath.length - 1],
        logIndex: parseInt(idx, 10),
        type: 'log',
        decodedMessage: Promise.resolve(null),
      });
    } else if (log.startsWith('Program data:')) {
      res.push({
        message: log,
        programId: instructionPath[instructionPath.length - 1],
        logIndex: parseInt(idx, 10),
        type: 'data',
        get decodedMessage(): Promise<DecodedData | null> {
          pendingDecode ??= decoder.decodeLog(this);
          return pendingDecode;
        }, // TODO getter function to parse
      });
    } else if (log.startsWith('Program return:')) {
      res.push({
        message: log,
        programId: instructionPath[instructionPath.length - 1],
        logIndex: parseInt(idx, 10),
        type: 'other',
        get decodedMessage(): Promise<DecodedData | null> {
          pendingDecode ??= decoder.decodeLog(this);
          return pendingDecode;
        }, // TODO getter function to parse, can return data be dcoded?
      });
    } else if (log.startsWith('Program consumption:')) {
      // DO nothing
    } else if (log.startsWith('Program')) {
      const [, /* "Program"*/ programAddress, mode, ...rest] = log.split(' '); // TODO doesn't work with compute units
      switch (mode) {
        case 'invoke':
          instructionPath.push(programAddress);
          break;
        case 'success':
          // TODO need to check this is always the last item
          instructionPath.pop();
          break;
        case 'consumed':
          // Do nothing
          break;
        case 'failed:':
          // TODO
          instructionPath.pop();
          break;
        default:
          throw new Error(`Unknown log mode: ${mode}, log: ${log}`);
      }
    } else {
      /**
       * Known examples (prefixes):
       *  * Transfer
       *  * Create Account
       *  * Allocate
       *  * Instruction references an unknown account
       * */

      logger.warn(`Unable to parse log message: ${log}`);
    }
  }

  // Implement this in order to calculate block size
  res.forEach((r) => {
    (r as any).toJSON = () => {
      return omit(r, ['decodedMessage']);
    };
  });

  return res;
}

type DictionaryLog = {
  message: string;
  logIndex: number;
  programId: string;
  kind: 'data' | 'log' | 'other';
};

function wrapDictionaryLogs(
  logs: DictionaryLog[],
  decoder: SolanaDecoder,
): SolanaLogMessage[] {
  return logs.map((l) => {
    let pendingDecode: Promise<DecodedData | null>;
    const res = {
      message: l.message,
      programId: l.programId,
      logIndex: l.logIndex,
      type: l.kind,
      get decodedMessage() {
        if (!['other', 'data'].includes(l.kind)) {
          return Promise.resolve(null);
        }

        pendingDecode ??= decoder.decodeLog(this);
        return pendingDecode;
      },
    };

    // Implement this in order to calculate block size
    (res as any).toJSON = () => {
      return omit(res, ['decodedMessage']);
    };

    return res;
  });
}

/**
 * Transforms a block from a raw response to the types injected into handlers*/
export function transformBlock(
  block: RawSolanaBlock,
  decoder: SolanaDecoder,
): SolanaBlock {
  const { transactions, ...baseBlock } = block;
  return {
    ...baseBlock,
    transactions: transactions.map((tx) => {
      try {
        return {
          ...tx,
          block: baseBlock,
          transaction: {
            ...tx.transaction,
            message: {
              ...tx.transaction.message,
              instructions: tx.transaction.message.instructions.map(
                (instruction, index) =>
                  wrapInstruction([index], instruction, tx, baseBlock, decoder),
              ),
            },
          },
          meta: tx.meta
            ? {
                ...tx.meta,
                innerInstructions: tx.meta.innerInstructions.map(
                  (innerInstruction) => ({
                    ...innerInstruction,
                    instructions: innerInstruction.instructions.map(
                      (instruction, innerIndex) =>
                        wrapInstruction(
                          [innerInstruction.index, innerIndex],
                          instruction,
                          tx,
                          baseBlock,
                          decoder,
                        ),
                    ),
                  }),
                ),
                // Dictionary blocks have logs instead of logMessages that are already somewhat wrapped
                logs: (tx.meta as any).logs
                  ? wrapDictionaryLogs((tx.meta as any).logs, decoder)
                  : wrapLogs(tx.meta.logMessages, decoder),
              }
            : null,
        };
      } catch (e) {
        throw new Error(
          `Failed to transform transaction: ${tx.transaction.signatures[0]}`,
          { cause: e },
        );
      }
    }),
  };
}

export function formatBlockUtil<B extends SolanaBlock = SolanaBlock>(
  block: B,
): IBlock<B> {
  return {
    block,
    getHeader: () => solanaBlockToHeader(block),
  };
}

export function solanaBlockToHeader(block: BaseSolanaBlock): Header {
  return {
    blockHeight: Number(block.parentSlot) + 1, // The blocks don't include the slot because they assume you know that when making the request
    blockHash: block.blockhash,
    parentHash: block.previousBlockhash,
    timestamp: new Date(Number(block.blockTime) * 1000),
  };
}
