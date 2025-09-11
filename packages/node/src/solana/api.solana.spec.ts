// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { IdlV01 } from '@codama/nodes-from-anchor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransactionFilter } from '@subql/common-solana';
import { IBlock } from '@subql/node-core';
import {
  SolanaBlock,
  SolanaBlockFilter,
  SolanaTransaction,
} from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';
import {
  filterBlocksProcessor,
  filterInstructionsProcessor,
  filterLogsProcessor,
  filterTransactionsProcessor,
} from './utils.solana';

// Add api key to work
const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ??
  'https://api.mainnet-beta.solana.com' ??
  'https://solana.api.onfinality.io/public';

const IDL_swap: IdlV01 = require('../../test/swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW.idl.json');

describe('Api.solana', () => {
  let solanaApi: SolanaApi;
  const eventEmitter = new EventEmitter2();
  let block: IBlock<SolanaBlock>;
  const decoder = new SolanaDecoder();

  beforeAll(async () => {
    solanaApi = await SolanaApi.create(HTTP_ENDPOINT, eventEmitter, decoder);
    // https://solscan.io/block/325922873
    block = await solanaApi.fetchBlock(325_922_873);
  }, 20_000);

  function getTxBySig(
    sig: string,
    specificBlock?: IBlock<SolanaBlock>,
  ): SolanaTransaction {
    const tx = (specificBlock ?? block).block.transactions.find((tx) =>
      tx.transaction.signatures.find((s) => s === sig),
    );
    if (!tx) {
      throw new Error(`Unable to find tx with signature ${sig}`);
    }
    return tx;
  }

  it('parses block timestamps correctly', () => {
    expect(block.getHeader().timestamp).toEqual(
      new Date('2025-03-10T22:40:28.000Z'),
    );
  });

  describe('Filters', () => {
    it('Should run block filters correctly', () => {
      const moduloBlockFilter: SolanaBlockFilter = {
        modulo: 1,
      };
      expect(
        filterBlocksProcessor(block.block, moduloBlockFilter),
      ).toBeTruthy();

      const moduloBlockFilter2: SolanaBlockFilter = {
        modulo: 325_922_870,
      };
      expect(
        filterBlocksProcessor(block.block, moduloBlockFilter2),
      ).toBeFalsy();

      // TODO timestamp block filter
    });

    it('Should run transaction filters correctly', () => {
      // https://solscan.io/tx/FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY
      const tx = getTxBySig(
        'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY',
      );

      const signerMatch: TransactionFilter = {
        signerAccountKey: '3j1iDNRseKJVEWAb62Xxn74mVjJ7sUTVJaaBNb3gKtUe',
      };
      expect(filterTransactionsProcessor(tx!, signerMatch)).toBeTruthy();

      const signerMismatch: TransactionFilter = {
        signerAccountKey: '7yYGUXSY9hSa3MqmU7t4acCMBzSQyjxZyoRC1bDKMKJh',
      };
      expect(filterTransactionsProcessor(tx!, signerMismatch)).toBeFalsy();
    });

    describe('instructions', () => {
      it('can filter failed instructions', () => {
        const failedTx = block.block.transactions.find((tx) => tx.meta?.err);
        const failedInst = failedTx!.transaction.message.instructions[0];
        expect(
          filterInstructionsProcessor(failedInst, solanaApi.decoder, {
            includeFailed: true,
          }),
        ).toBeTruthy();
        expect(
          filterInstructionsProcessor(failedInst, solanaApi.decoder, {
            includeFailed: false,
          }),
        ).toBeFalsy();
      });

      it('can filter programIds', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );
        const inst = tx?.transaction.message.instructions[4];

        expect(inst).toBeDefined();

        // A program called by this instruction
        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          }),
        ).toBe(true);

        // A program not called by this instruction
        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          }),
        ).toBe(false);
      });

      it.each([
        // ['human', 'swap', true], // TODO wrong IDL currently
        ['hex', '0x09', true],
        ['base58', 'A', true],
        ['human', 'shutdown', false],
        ['hex', '0x74ce1bbfa6130049', false],
        ['base58', 'kPf6M86k1NDLT', false],
      ])(
        'should correctly match discrminators in %s format',
        (_, discriminator, result) => {
          // TODO wrong IDL currently
          solanaApi.decoder.idls[
            '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
          ] = IDL_swap;
          const tx = getTxBySig(
            '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
          );
          const inst = tx?.transaction.message.instructions[4];

          expect(
            filterInstructionsProcessor(inst!, solanaApi.decoder, {
              programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
              discriminator,
            }),
          ).toBe(result);
        },
      );

      it('can filter accounts', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );
        const inst = tx?.transaction.message.instructions[4];

        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            accounts: [null, ['6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W']],
          }),
        ).toBe(true);

        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            accounts: [
              null,
              null,
              ['6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W'], // Out of position
            ],
          }),
        ).toBe(false);

        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            accounts: [null, null, []],
          }),
        ).toBe(false);

        expect(
          filterInstructionsProcessor(inst!, solanaApi.decoder, {
            accounts: [
              null,
              [
                '6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W',
                '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
              ], // Out of position
            ],
          }),
        ).toBe(true);
      });
    });

    describe('logs', () => {
      it('should filter logs by program Id', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );

        const log = tx!.meta!.logs![1];
        expect(log).toBeDefined();
        // Matching program id
        expect(
          filterLogsProcessor(log, {
            programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          }),
        ).toBe(true);

        // non-matching programId
        expect(
          filterLogsProcessor(log, {
            programId: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
          }),
        ).toBe(false);
      });
    });
  });

  describe('Block parsing', () => {
    it('makes instructions that have a transaction property', () => {
      const tx = getTxBySig(
        'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY',
      );

      for (const instruction of tx!.transaction.message.instructions) {
        expect(instruction.transaction).toBeDefined();
      }

      for (const innerInstruction of tx!.meta!.innerInstructions) {
        for (const instruction of innerInstruction.instructions) {
          expect(instruction.transaction).toBeDefined();
        }
      }
    });

    it('corretly parses logs', () => {
      const tx = getTxBySig(
        '4vGc5nP4W7VZe7SmSb2GsJMG3KJijZJ4KGHUCQ14FmqfPsyDotn7kwR5nA13PpzjwT732ggiLuDGs5PDpjRCKsC6',
      );
      expect(tx!.meta!.logs).toBeDefined();
      expect(tx!.meta!.logs!.length).toBeGreaterThan(0);

      // Tx with data logs
      const txWData = getTxBySig(
        'qtUujQqx16ChZRMG4TE9eNMp4th3GxLvuuCQBEXK4KYyjqfAAPbP6xejA2ZTUe7X1cZYiHCnJHpC5v6GRctYc8c',
      );
      expect(txWData!.meta!.logs).toBeDefined();
      expect(txWData!.meta!.logs!.length).toBeGreaterThan(0);

      // Tx with a failure
      const txWError = getTxBySig(
        '8q3z3WoYUcA8UQLYgdgriGCZrGJUAYoeUwTJaVuuq43AmKLQxKLAMxuEAWXMquozVXEX4eL91r3jxKFVifmeXrv',
      );
      expect(txWError!.meta!.logs).toBeDefined();
      expect(txWError!.meta!.logs!.length).toBeGreaterThan(0);
    });

    it('can parse a block with a transaction that has "null" innerTransactions', async () => {
      // The problem transaction: https://solscan.io/tx/3mSAfK9hm4wgMw5kzKpVz73viBftapNLwECN9rmG5Q6qWPyARognZsyoosB4XjYf5nFRtcEmrKGVgLGLRN7tnmWN?cluster=devnet
      const solanaApi = await SolanaApi.create(
        'https://api.devnet.solana.com',
        eventEmitter,
        decoder,
      );

      const block = await solanaApi.fetchBlock(405433240);

      expect(block).toBeDefined();

      expect(
        getTxBySig(
          '3mSAfK9hm4wgMw5kzKpVz73viBftapNLwECN9rmG5Q6qWPyARognZsyoosB4XjYf5nFRtcEmrKGVgLGLRN7tnmWN',
          block,
        ),
      ).toBeDefined();
    });
  });

  // Tests that data types can be stringified, this is important to test because of circular references
  describe('JSON serialization', () => {
    it('can stringify a SolanaBlock', () => {
      expect(() => JSON.stringify(block)).not.toThrow();
    });

    it('can stringify a SolanaTransaction', () => {
      const tx = getTxBySig(
        '4vGc5nP4W7VZe7SmSb2GsJMG3KJijZJ4KGHUCQ14FmqfPsyDotn7kwR5nA13PpzjwT732ggiLuDGs5PDpjRCKsC6',
      );

      expect(tx).toBeDefined();
      expect(() => JSON.stringify(tx)).not.toThrow();
    });

    it('can stringify a SolanaInstruction', () => {
      const tx = getTxBySig(
        '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
      );
      const inst = tx?.transaction.message.instructions[4];
      expect(inst).toBeDefined();

      const decodeInst = jest.spyOn(solanaApi.decoder, 'decodeInstruction');
      expect(() => JSON.stringify(inst)).not.toThrow();
      expect(decodeInst).not.toHaveBeenCalled();
    });

    it('can stringify a LogMessage', () => {
      const tx = getTxBySig(
        '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
      );

      for (const log of tx!.meta!.logs!) {
        const decodeLog = jest.spyOn(solanaApi.decoder, 'decodeLog');
        expect(() => JSON.stringify(log)).not.toThrow();
        expect(decodeLog).not.toHaveBeenCalled();
      }
    });
  });
});
