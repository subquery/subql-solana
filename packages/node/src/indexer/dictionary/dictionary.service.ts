// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NETWORK_FAMILY } from '@subql/common';
import { NodeConfig, DictionaryService, getLogger } from '@subql/node-core';
import { SolanaBlock, SubqlDatasource } from '@subql/types-solana';
import { SubqueryProject } from '../../configure/SubqueryProject';
import { SolanaApiService } from '../../solana';
import { SolanaDictionaryV2 } from './v2';

const logger = getLogger('dictionary');

@Injectable()
export class SolanaDictionaryService extends DictionaryService<
  SubqlDatasource,
  SolanaBlock
> {
  constructor(
    @Inject('ISubqueryProject') protected project: SubqueryProject,
    nodeConfig: NodeConfig,
    eventEmitter: EventEmitter2,
    @Inject('APIService') private apiService: SolanaApiService,
  ) {
    super(project.network.chainId, nodeConfig, eventEmitter);
  }

  async initDictionaries(): Promise<void> {
    const dictionariesV2: SolanaDictionaryV2[] = [];

    if (!this.project) {
      throw new Error(`Project in Dictionary service not initialized `);
    }

    const dictionaryEndpoints = await this.getDictionaryEndpoints(
      NETWORK_FAMILY.solana,
      this.project.network,
    );

    for (const endpoint of dictionaryEndpoints) {
      try {
        const dictionaryV2 = await SolanaDictionaryV2.create(
          endpoint,
          this.nodeConfig,
          this.project,
          this.apiService.api,
        );
        dictionariesV2.push(dictionaryV2);
      } catch (e) {
        logger.warn(
          `Dictionary endpoint "${endpoint}" is not a valid dictionary`,
        );
      }
    }
    logger.debug(`Dictionary versions v2: ${dictionariesV2.length}`);
    // v2 should be prioritised
    this.init([...dictionariesV2]);
  }
}
