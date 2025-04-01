// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { EventEmitter2 } from '@nestjs/event-emitter';
import { BlockchainService } from './blockchain.service';
import { SolanaApi, SolanaApiService } from './solana';

const HTTP_ENDPOINT = 'https://ethereum.rpc.subquery.network/public';

const mockApiService = async (): Promise<SolanaApiService> => {
  const solanaApi = await SolanaApi.create(HTTP_ENDPOINT, new EventEmitter2());

  return {
    unsafeApi: solanaApi,
  } as any;
};

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;

  beforeEach(async () => {
    const apiService = await mockApiService();

    blockchainService = new BlockchainService(apiService);
  });

  it('can get a block timestamps', async () => {
    const timestamp = await blockchainService.getBlockTimestamp(4_000_000);

    expect(timestamp).toEqual(new Date('2017-07-09T20:52:47.000Z'));
  });
});
