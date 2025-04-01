// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  ConnectionPoolService,
  ConnectionPoolStateManager,
  NodeConfig,
} from '@subql/node-core';
import { GraphQLSchema } from 'graphql';
import { range } from 'lodash';
import { SubqueryProject } from '../configure/SubqueryProject';
import { SolanaApiService } from './api.service.solana';

// Add api key to work
const HTTP_ENDPOINT = 'https://solana.api.onfinality.io/public';

function testSubqueryProject(endpoint: string): SubqueryProject {
  return {
    network: {
      endpoint: [endpoint],
      chainId: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    },
    dataSources: [],
    id: 'test',
    root: './',
    schema: new GraphQLSchema({}),
    templates: [],
  } as any;
}

const prepareApiService = async (
  endpoint: string = HTTP_ENDPOINT,
): Promise<[SolanaApiService, INestApplication]> => {
  const module = await Test.createTestingModule({
    providers: [
      ConnectionPoolService,
      ConnectionPoolStateManager,
      {
        provide: NodeConfig,
        useFactory: () => ({}),
      },
      {
        provide: 'ISubqueryProject',
        useFactory: () => testSubqueryProject(endpoint),
      },
      {
        provide: SolanaApiService,
        useFactory: SolanaApiService.init,
        inject: [
          'ISubqueryProject',
          ConnectionPoolService,
          EventEmitter2,
          NodeConfig,
        ],
      },
    ],
    imports: [EventEmitterModule.forRoot()],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  const apiService = app.get(SolanaApiService);
  return [apiService, app];
};

jest.setTimeout(90000);
describe('ApiService', () => {
  let apiService: SolanaApiService;
  let app: INestApplication;

  beforeEach(async () => {
    [apiService, app] = await prepareApiService();
  });

  afterEach(async () => {
    return app?.close();
  });

  it('can instantiate api', () => {
    expect(apiService.api.getRuntimeChain()).toEqual('mainnet');
  });

  it('can fetch blocks', async () => {
    await expect(
      apiService.api.fetchBlocks(range(12369621, 12369625)),
    ).resolves.toHaveLength(4);
  });

  it('can get the finalized height', async () => {
    const height = await apiService.api.getFinalizedBlockHeight();

    console.log('Finalized height', height);
    expect(height).toBeGreaterThan(16_000_000);
  });

  // it('ensure api errorCode is exposed when throwing', async () => {
  //   await expect(
  //     apiService
  //       .safeApi(17520376)
  //       .getCode('0x75F0398549C9fDEa03BbDde388361827cb376D5'),
  //   ).rejects.toHaveProperty('code', 'INVALID_ARGUMENT');
  // });

  // it('should not retry on any errors not in the retry list', async () => {
  //   const callSpy = jest.spyOn(apiService.unsafeApi, 'getSafeApi');
  //   await expect(
  //     apiService
  //       .safeApi(17520376)
  //       .getCode('0x75F0398549C9fDEa03BbDde388361827cb376D5'),
  //   ).rejects.toHaveProperty('code', 'INVALID_ARGUMENT');

  //   expect(callSpy).toHaveBeenCalledTimes(1);
  // });
});
