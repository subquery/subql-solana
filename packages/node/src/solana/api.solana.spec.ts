// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransactionFilter } from '@subql/common-solana';
import {
  SolanaBlock,
  SolanaBlockFilter,
  SolanaTransaction,
} from '@subql/types-solana';
import { SolanaApi } from './api.solana';
import {
  filterBlocksProcessor,
  filterInstructionsProcessor,
  filterTransactionsProcessor,
} from './utils.solana';

// Add api key to work
const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

describe('Api.solana', () => {
  let solanaApi: SolanaApi;
  const eventEmitter = new EventEmitter2();
  let blockData: SolanaBlock;

  const fetchBlock = async (height: number) => {
    const block = await solanaApi.fetchBlock(height);

    return block.block as SolanaBlock;
  };

  beforeAll(async () => {
    solanaApi = await SolanaApi.create(HTTP_ENDPOINT, eventEmitter);
    // https://solscan.io/block/325922873
    blockData = await fetchBlock(325_922_873);
  }, 20_000);

  function getTxBySig(sig: string): SolanaTransaction {
    const tx = blockData.transactions.find((tx) =>
      tx.transaction.signatures.find((s) => s === sig),
    );
    if (!tx) {
      throw new Error(`Unable to find tx with signature ${sig}`);
    }
    return tx;
  }

  describe('Filters', () => {
    it('Should run block filters correctly', () => {
      const moduloBlockFilter: SolanaBlockFilter = {
        modulo: 1,
      };
      expect(filterBlocksProcessor(blockData, moduloBlockFilter)).toBeTruthy();

      const moduloBlockFilter2: SolanaBlockFilter = {
        modulo: 325_922_870,
      };
      expect(filterBlocksProcessor(blockData, moduloBlockFilter2)).toBeFalsy();

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
      it('can filter programIds', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );
        const inst = tx?.transaction.message.instructions[4];

        expect(inst).toBeDefined();

        // A program called by this instruction
        expect(
          filterInstructionsProcessor(inst!, {
            programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          }),
        ).toBe(true);

        // A program not called by this instruction
        expect(
          filterInstructionsProcessor(inst!, {
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          }),
        ).toBe(false);
      });

      it('can filter discriminators', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );
        const inst = tx?.transaction.message.instructions[4];

        const validNames = [
          'raydium:swap', // Human
          '09', // Hex
          '09', // Base58
        ];

        for (const discriminator of validNames) {
          expect(
            filterInstructionsProcessor(inst!, {
              discriminator,
            }),
          ).toBe(true);
        }

        const invalidNames = [
          'claim_token', // Human
          '74ce1bbfa6130049', // Hex
          // 'kPf6M86k1NDLT', // Base58
        ];
        for (const discriminator of invalidNames) {
          expect(
            filterInstructionsProcessor(inst!, {
              discriminator,
            }),
          ).toBe(false);
        }
      });

      it('can filter accounts', () => {
        const tx = getTxBySig(
          '4V5S9ymSheic34SsHN9AHA86b41qXfA9JwdEra1UUgoNdvWFTMA5ueSCHn6nRTBDphMQFUFLPgU4N2QsG8En3J1d',
        );
        const inst = tx?.transaction.message.instructions[4];

        expect(
          filterInstructionsProcessor(inst!, {
            accounts: [null, ['6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W']],
          }),
        ).toBe(true);

        expect(
          filterInstructionsProcessor(inst!, {
            accounts: [
              null,
              null,
              ['6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W'], // Out of position
            ],
          }),
        ).toBe(false);

        expect(
          filterInstructionsProcessor(inst!, {
            accounts: [null, null, []],
          }),
        ).toBe(false);

        expect(
          filterInstructionsProcessor(inst!, {
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
        throw new Error('Test not implemented');
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

    it('can decode instruction data', () => {
      throw new Error('Test not implemented');
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
      // console.log('META LOGS', txWData.meta.logs);
      expect(txWData!.meta!.logs).toBeDefined();
      expect(txWData!.meta!.logs!.length).toBeGreaterThan(0);

      // Tx with a failure
      const txWError = getTxBySig(
        '8q3z3WoYUcA8UQLYgdgriGCZrGJUAYoeUwTJaVuuq43AmKLQxKLAMxuEAWXMquozVXEX4eL91r3jxKFVifmeXrv',
      );
      // console.log('ERROR LOGS', txWError.meta.logs);
      expect(txWError!.meta!.logs).toBeDefined();
      expect(txWError!.meta!.logs!.length).toBeGreaterThan(0);
    });

    it('can decode log data', () => {
      throw new Error('Test not implemented');
    });
  });

  // Tests that data types can be stringified, this is important to test because of circular references
  describe('JSON serialization', () => {
    it('can stringify a SolanaBlock', () => {
      // TODO write test
      throw new Error('Test not implemented');
    });

    it('can stringify a SolanaTransaction', () => {
      // TODO write test
      throw new Error('Test not implemented');
    });

    it('can stringify a SolanaInstruction', () => {
      // TODO write test
      throw new Error('Test not implemented');
    });

    it('can stringify a LogMessage', () => {
      // TODO write test
      throw new Error('Test not implemented');
    });
  });
});
