// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import path from 'node:path';
import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  StoreService,
  NodeConfig,
  ConnectionPoolService,
  ConnectionPoolStateManager,
  PoiSyncService,
  InMemoryCacheService,
  MonitorService,
  CoreModule,
  ProjectService,
  DynamicDsService,
  DsProcessorService,
  FetchService,
  DictionaryService,
  UnfinalizedBlocksService,
  blockDispatcherFactory,
} from '@subql/node-core';
import { BlockchainService } from '../blockchain.service';
import { SolanaApiService } from '../solana/api.service.solana';
import { SolanaDictionaryService } from './dictionary/dictionary.service';
import { IndexerManager } from './indexer.manager';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: 'APIService',
      useFactory: SolanaApiService.init,
      inject: [
        'ISubqueryProject',
        ConnectionPoolService,
        EventEmitter2,
        NodeConfig,
      ],
    },
    {
      provide: 'IBlockchainService',
      useClass: BlockchainService,
    },
    IndexerManager,
    {
      provide: 'IBlockDispatcher',
      useFactory: blockDispatcherFactory(path.resolve(__dirname, '../../dist/indexer/worker/worker.js'), []),
      inject: [
        NodeConfig,
        EventEmitter2,
        'IProjectService',
        'IProjectUpgradeService',
        InMemoryCacheService,
        StoreService,
        'IStoreModelProvider',
        PoiSyncService,
        'ISubqueryProject',
        DynamicDsService,
        'IUnfinalizedBlocksService',
        ConnectionPoolStateManager,
        'IBlockchainService',
        IndexerManager,
        MonitorService,
      ],
    },
    FetchService,
    {
      provide: DictionaryService,
      useClass: SolanaDictionaryService,
    },
    DsProcessorService,
    DynamicDsService,
    {
      useClass: ProjectService,
      provide: 'IProjectService',
    },
    {
      provide: 'IUnfinalizedBlocksService',
      useClass: UnfinalizedBlocksService,
    },
  ],
})
export class FetchModule {}
