// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import path from 'path';
import { translateAddress } from '@coral-xyz/anchor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Connection } from '@solana/web3.js';
import { TransactionFilter } from '@subql/common-solana';
import {
  SolanaBlock,
  SolanaBlockFilter,
  SolanaDatasourceKind,
  SolanaHandlerKind,
  SolanaLogFilter,
  SubqlRuntimeDatasource,
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

const ds: SubqlRuntimeDatasource = {
  mapping: {
    file: '',
    handlers: [
      {
        handler: 'test',
        kind: SolanaHandlerKind.Transaction,
        filter: {
          /*function: '0x23b872dd'*/
        },
      },
    ],
  },
  kind: SolanaDatasourceKind.Runtime,
  startBlock: 16258633,
  options: { abi: 'erc721' },
  assets: new Map([
    ['erc721', { file: path.join(__dirname, '../../test/erc721.json') }],
  ]),
};

jest.setTimeout(90000);
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
  });

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
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY',
        ),
      );
      expect(tx).toBeDefined();

      const signerMatch: TransactionFilter = {
        signerAccountKey: '3j1iDNRseKJVEWAb62Xxn74mVjJ7sUTVJaaBNb3gKtUe',
      };
      expect(filterTransactionsProcessor(tx!, signerMatch)).toBeTruthy();

      const signerMismatch: TransactionFilter = {
        signerAccountKey: '7yYGUXSY9hSa3MqmU7t4acCMBzSQyjxZyoRC1bDKMKJh',
      };
      expect(filterTransactionsProcessor(tx!, signerMismatch)).toBeFalsy();
    });

    it('Should run instruction filters correctly', () => {
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY',
        ),
      );

      const inst = tx?.transaction.message.instructions[1];

      expect(inst).toBeDefined();

      // A program called by this instruction
      expect(
        filterInstructionsProcessor(inst!, {
          programId: 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
        }),
      ).toBe(true);

      // A program not called by this instruction
      expect(
        filterInstructionsProcessor(inst!, {
          programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        }),
      ).toBe(false);
    });

    it('Should run log filters correctly', () => {
      // TODO write tests
      throw new Error('Test not implemented');
    });
  });

  describe('Block parsing', () => {
    it('makes instructions that have a transaction property', () => {
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            'FQNxV3NQHf6JBzYkaaWaRVj3eAtdEVSsjdStXM9ciZmWfoeiABaG3dXqK612T3LMi3McP5hf967AgJByvRkkRJY',
        ),
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
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '4vGc5nP4W7VZe7SmSb2GsJMG3KJijZJ4KGHUCQ14FmqfPsyDotn7kwR5nA13PpzjwT732ggiLuDGs5PDpjRCKsC6',
        ),
      );
      expect(tx!.meta!.logs).toBeDefined();
      expect(tx!.meta!.logs!.length).toBeGreaterThan(0);

      // Tx with data logs
      const txWData = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            'qtUujQqx16ChZRMG4TE9eNMp4th3GxLvuuCQBEXK4KYyjqfAAPbP6xejA2ZTUe7X1cZYiHCnJHpC5v6GRctYc8c',
        ),
      );
      // console.log('META LOGS', txWData.meta.logs);
      expect(txWData!.meta!.logs).toBeDefined();
      expect(txWData!.meta!.logs!.length).toBeGreaterThan(0);

      // Tx with a failure
      const txWError = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '8q3z3WoYUcA8UQLYgdgriGCZrGJUAYoeUwTJaVuuq43AmKLQxKLAMxuEAWXMquozVXEX4eL91r3jxKFVifmeXrv',
        ),
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

  it('has the same behaviour for getAccountInfo as legacy @solana/web3.js', async () => {
    const connection2 = new Connection(HTTP_ENDPOINT);

    const res1 = await solanaApi.getAccountInfo(
      'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE',
    );
    const res2 = await connection2.getAccountInfo(
      translateAddress('SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE'),
    );
    expect(res1?.data).toEqual(res2?.data);
  });
});
