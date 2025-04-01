// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject, Injectable } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  NodeConfig,
  TestingService as BaseTestingService,
  NestLogger,
  TestRunner,
  ProjectService,
} from '@subql/node-core';
import {
  SolanaProjectDs,
  SubqueryProject,
} from '../configure/SubqueryProject';
import { BlockContent } from '../indexer/types';
import { SolanaApi, SolanaSafeApi } from '../solana';
import { TestingModule } from './testing.module';

@Injectable()
export class TestingService extends BaseTestingService<
  SolanaApi,
  SolanaSafeApi,
  BlockContent,
  SolanaProjectDs
> {
  constructor(
    nodeConfig: NodeConfig,
    @Inject('ISubqueryProject') project: SubqueryProject,
  ) {
    super(nodeConfig, project);
  }

  async getTestRunner(): Promise<
    [
      close: () => Promise<void>,
      runner: TestRunner<
        SolanaApi,
        SolanaSafeApi,
        BlockContent,
        SolanaProjectDs
      >,
    ]
  > {
    const testContext = await NestFactory.createApplicationContext(
      TestingModule,
      {
        logger: new NestLogger(!!this.nodeConfig.debug),
      },
    );

    await testContext.init();

    const projectService: ProjectService = testContext.get('IProjectService');

    await projectService.init();

    return [testContext.close.bind(testContext), testContext.get(TestRunner)];
  }
}
