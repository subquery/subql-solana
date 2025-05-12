// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubqlSolanaDataSource } from '@subql/common-solana';
import { SolanaDatasourceKind, SolanaHandlerKind } from '@subql/types-solana';
import { cloneDeep } from 'lodash';
import { BlockchainService } from './blockchain.service';
import { SolanaApi, SolanaApiService, SolanaDecoder } from './solana';

const HTTP_ENDPOINT =
  process.env.HTTP_ENDPOINT ?? 'https://solana.api.onfinality.io/public';

const mockApiService = async (): Promise<SolanaApiService> => {
  const solanaApi = await SolanaApi.create(
    HTTP_ENDPOINT,
    new EventEmitter2(),
    new SolanaDecoder(),
  );

  return {
    unsafeApi: solanaApi,
    api: solanaApi,
  } as any;
};

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;

  beforeEach(async () => {
    const apiService = await mockApiService();

    blockchainService = new BlockchainService(apiService);
  });

  it('can get a block timestamps', async () => {
    const timestamp = await blockchainService.getBlockTimestamp(325_922_873);

    expect(timestamp).toEqual(new Date('2025-03-10T22:40:28.000Z'));
  });

  it('can instantiate dynamic datasources correctly', async () => {
    const template: Omit<SubqlSolanaDataSource, 'startBlock'> = {
      kind: SolanaDatasourceKind.Runtime,
      mapping: {
        file: '',
        handlers: [
          {
            handler: 'handleSomething',
            kind: SolanaHandlerKind.Instruction,
            filter: {
              progamId: 'foo',
            },
          },
        ],
      },
    };

    const mutableTemplate = cloneDeep(template);

    await blockchainService.updateDynamicDs(
      {
        templateName: 'test',
        startBlock: 400_000_000,
        args: {
          accounts: [null, '6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W'],
        },
      },
      mutableTemplate as SubqlSolanaDataSource,
    );

    expect(mutableTemplate).toEqual({
      kind: SolanaDatasourceKind.Runtime,
      mapping: {
        file: '',
        handlers: [
          {
            handler: 'handleSomething',
            kind: SolanaHandlerKind.Instruction,
            filter: {
              progamId: 'foo',
              accounts: [null, '6fuLRV8aLJF96MaNi44bLJUhaSJu1yzc588kHM4DfG2W'],
            },
          },
        ],
      },
    });
  });
});
