// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { IdlV01 } from '@codama/nodes-from-anchor';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SolanaBlock } from '@subql/types-solana';
import bs58 from 'bs58';
import { RootNode } from 'codama';
import { SolanaApi } from './api.solana';
import { SolanaDecoder } from './decoder';
import { getProgramId } from './utils.solana';

const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

const IDL_Jupiter: IdlV01 = require('../../test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json');
const IDL_swap: IdlV01 = require('../../test/swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW.idl.json');
const IDL_token: RootNode = require('../../test/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA.idl.json');

describe('SolanaDecoder', () => {
  let solanaApi: SolanaApi;
  let decoder: SolanaDecoder;
  let blockData: SolanaBlock;

  beforeAll(async () => {
    decoder = new SolanaDecoder();
    solanaApi = await SolanaApi.create(
      HTTP_ENDPOINT,
      new EventEmitter2(),
      decoder,
    );
  });

  const loadDecoderIdls = () => {
    // eslint-disable-next-line @typescript-eslint/dot-notation
    decoder.idls['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'] = IDL_Jupiter;
    // eslint-disable-next-line @typescript-eslint/dot-notation
    decoder.idls['swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW'] = IDL_swap;
    // eslint-disable-next-line @typescript-eslint/dot-notation
    decoder.idls['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] = IDL_token;
  };

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

  describe('parsing instruction discriminators', () => {
    beforeAll(() => {
      loadDecoderIdls();
    });

    it('correctly parses Anchor program discriminators', () => {
      for (const inst of IDL_Jupiter.instructions) {
        expect(
          decoder.parseDiscriminator(
            inst.name,
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
          ),
        ).toEqual(Buffer.from(inst.discriminator));
      }
    });

    it('correctly parses SPL program discriminators', () => {
      for (let i = 0; i < IDL_token.program.instructions.length; i++) {
        const inst = IDL_token.program.instructions[i];
        expect(
          decoder.parseDiscriminator(
            inst.name,
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        ).toEqual(Buffer.from([i]));
      }
    });

    it('correctly parses hex discriminators', () => {
      for (let i = 0; i < IDL_token.program.instructions.length; i++) {
        expect(
          decoder.parseDiscriminator(
            `0x${Buffer.from([i]).toString('hex')}`,
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        ).toEqual(Buffer.from([i]));
      }

      for (const inst of IDL_Jupiter.instructions) {
        expect(
          decoder.parseDiscriminator(
            `0x${Buffer.from(inst.discriminator).toString('hex')}`,
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        ).toEqual(Buffer.from(inst.discriminator));
      }
    });

    it('correctly parses base58 discriminators', () => {
      for (let i = 0; i < IDL_token.program.instructions.length; i++) {
        expect(
          decoder.parseDiscriminator(
            bs58.encode(Buffer.from([i])),
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        ).toEqual(Buffer.from([i]));
      }

      for (const inst of IDL_Jupiter.instructions) {
        expect(
          decoder.parseDiscriminator(
            bs58.encode(Buffer.from(inst.discriminator)),
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ),
        ).toEqual(Buffer.from(inst.discriminator));
      }
    });
  });

  describe('decode instrutions', () => {
    beforeAll(async () => {
      // https://solscan.io/block/330469167
      const { block } = await solanaApi.fetchBlock(330_469_167);
      blockData = block;

      loadDecoderIdls();
    }, 30_000);

    const instructionData = {
      routePlan: [
        {
          swap: {
            __kind: 'MeteoraDlmm',
          },
          percent: 100,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
      inAmount: BigInt(16000),
      quotedOutAmount: BigInt(126754),
      slippageBps: 200,
      platformFeeBps: 98,
    };

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
      expect(decoded!.data).toEqual(instructionData);
    });

    // Since removing anchor we don't have a way of fetching IDLS
    it.skip('can decode an instruction with an IDL found on chain', async () => {
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
      expect(decoded!.data).toEqual(instructionData);
    });

    it('can decode SPL token program instructions', async () => {
      const tx = blockData.transactions.find((tx) =>
        tx.transaction.signatures.find(
          (s) =>
            s ===
            '61vjnjBfvU3e2BqmatPd3uYi37woXS44oqcQ3gD1XoS4demqXSmT32vGpdYdXTHW5niePACTKQaDxipn6jhbTWDL',
        ),
      );

      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      const instruction = tx!.meta?.innerInstructions.find(
        (inner) => inner.index === 0,
      )?.instructions[1]!;

      const program = getProgramId(instruction);
      expect(program).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

      const decoded = await decoder.decodeInstruction(instruction);

      expect(decoded).toEqual({
        name: 'transferChecked',
        data: {
          amount: BigInt('5904646875'),
          decimals: 6,
        },
      });
    });
  });

  describe('decode log', () => {
    beforeAll(async () => {
      //https://solscan.io/block/327347682
      const { block } = await solanaApi.fetchBlock(327_347_682);
      loadDecoderIdls();
      blockData = block;
    }, 30_000);

    const logData = {
      pubkey: 'BQR6JJFyMWxnUERqbCRCCy1ietW2yq8RTKDx9odzruha',
      data: {
        balances: [BigInt('16648442361'), BigInt('4003645427000')],
      },
    };

    it('can decode a log with an Anchor IDL file', async () => {
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
      expect(decoded!.name).toBe('poolBalanceUpdatedEvent');
      expect(decoded!.data).toEqual(logData);
    });
  });
});
