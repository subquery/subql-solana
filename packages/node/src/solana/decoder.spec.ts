// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

import { Idl } from '@coral-xyz/anchor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SolanaBlock } from '@subql/types-solana';
import { BN } from 'bn.js';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';

const IDL_Jupiter: Idl = require('../../test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json');
const IDL_swap: Idl = require('../../test/swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW.idl.json');

function stringify(value: any): string {
  return JSON.stringify(value, (_, v) => (BN.isBN(v) ? v.toString() : v));
}

describe('SolanaDecoder', () => {
  let solanaApi: SolanaApi;
  let decoder: SolanaDecoder;
  let blockData: SolanaBlock;

  beforeAll(async () => {
    solanaApi = await SolanaApi.create(HTTP_ENDPOINT, new EventEmitter2());
    decoder = new SolanaDecoder(solanaApi);
  });

  describe('caching IDLs', () => {
    it('caches IDLs from the network', async () => {
      const spy = jest.spyOn(solanaApi, 'getAccountInfo');

      const mockInst = {
        transaction: {
          transaction: {
            message: {
              accountKeys: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'],
            },
          },
        },
        data: '',
        programIdIndex: 0,
      };

      await decoder.decodeInstruction(mockInst as any);
      await decoder.decodeInstruction(mockInst as any);

      expect(spy).toHaveBeenCalledTimes(1);

      await decoder.decodeLog({
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
        message: '',
      } as any);

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('decode instrutions', () => {
    beforeAll(async () => {
      //https://solscan.io/block/330469167
      const { block } = await solanaApi.fetchBlock(330_469_167);
      blockData = block;

      // eslint-disable-next-line @typescript-eslint/dot-notation
      decoder.idls['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'] = IDL_Jupiter;
      // eslint-disable-next-line @typescript-eslint/dot-notation
      decoder.idls['swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW'] = IDL_swap;
    }, 30_000);

    const instructionData = stringify({
      route_plan: [
        {
          swap: {
            MeteoraDlmm: {},
          },
          percent: 100,
          input_index: 0,
          output_index: 1,
        },
      ],
      in_amount: new BN(16000),
      quoted_out_amount: new BN(126754),
      slippage_bps: 200,
      platform_fee_bps: 98,
    });

    it('can decode an instruction with an IDL file', async () => {
      //https://solscan.io/tx/3rf2sSMeJC1dd4t4TDvYPfvQjpL6DG6qdDcMnruDtATPbwjqt3xDnNvddtiTBESL8AWiFt2zENghqAh1h252bKQi
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '3rf2sSMeJC1dd4t4TDvYPfvQjpL6DG6qdDcMnruDtATPbwjqt3xDnNvddtiTBESL8AWiFt2zENghqAh1h252bKQi',
        ),
      );
      const instruction = tx!.transaction.message.instructions[3];

      const decoded = await decoder.decodeInstruction(instruction);

      expect(decoded).toBeDefined();
      expect(decoded!.name).toEqual('route');
      expect(stringify(decoded!.data)).toEqual(instructionData);
    });

    it('can decode an instruction with an IDL found on chain', async () => {
      // https://solscan.io/tx/3rf2sSMeJC1dd4t4TDvYPfvQjpL6DG6qdDcMnruDtATPbwjqt3xDnNvddtiTBESL8AWiFt2zENghqAh1h252bKQi
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '3rf2sSMeJC1dd4t4TDvYPfvQjpL6DG6qdDcMnruDtATPbwjqt3xDnNvddtiTBESL8AWiFt2zENghqAh1h252bKQi',
        ),
      );
      const instruction = tx!.transaction.message.instructions[3];
      const decoded = await decoder.decodeInstruction(instruction);

      expect(decoded).toBeDefined();
      expect(decoded!.name).toEqual('route');
      expect(stringify(decoded!.data)).toEqual(instructionData);
    });
  });

  describe('decode log', () => {
    beforeAll(async () => {
      //https://solscan.io/block/327347682
      const { block } = await solanaApi.fetchBlock(327_347_682);
      blockData = block;
    }, 30_000);

    const logData = stringify({
      pubkey: 'BQR6JJFyMWxnUERqbCRCCy1ietW2yq8RTKDx9odzruha',
      data: {
        balances: ['03e05311f9', '03a42bdd0d38'],
      },
    });

    it('can decode a log with an IDL file', async () => {
      // https://solscan.io/tx/5Z18NZWUiDmxmVYncvuyACB9HRRYyzZfRPE9pfT2yaTpAveDTUwghWaYMPRk9Df5HsJy9yd6dBrndrmHz1zfsAig
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '5Z18NZWUiDmxmVYncvuyACB9HRRYyzZfRPE9pfT2yaTpAveDTUwghWaYMPRk9Df5HsJy9yd6dBrndrmHz1zfsAig',
        ),
      );

      const programLogs = tx!.meta!.logs?.filter((l) =>
        l.message.startsWith('Program data:'),
      );
      expect(programLogs?.length).toBe(1);

      const decoded = await decoder.decodeLog(programLogs![0]);

      expect(decoded).not.toBeNull();
      expect(decoded!.name).toBe('PoolBalanceUpdatedEvent');
      expect(stringify(decoded!.data)).toBe(logData);
    });

    it('can decode a log with an IDL found on chain', async () => {
      // https://solscan.io/tx/5Z18NZWUiDmxmVYncvuyACB9HRRYyzZfRPE9pfT2yaTpAveDTUwghWaYMPRk9Df5HsJy9yd6dBrndrmHz1zfsAig
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '5Z18NZWUiDmxmVYncvuyACB9HRRYyzZfRPE9pfT2yaTpAveDTUwghWaYMPRk9Df5HsJy9yd6dBrndrmHz1zfsAig',
        ),
      );

      const programLogs = tx!.meta!.logs?.filter((l) =>
        l.message.startsWith('Program data:'),
      );
      expect(programLogs?.length).toBe(1);

      const decoded = await decoder.decodeLog(programLogs![0]);

      expect(decoded).not.toBeNull();
      expect(decoded!.name).toBe('PoolBalanceUpdatedEvent');
      expect(stringify(decoded!.data)).toBe(logData);
    });
  });
});
