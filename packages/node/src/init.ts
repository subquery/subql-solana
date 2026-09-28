// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { NestFactory } from '@nestjs/core';
import { notifyUpdates } from '@subql/common';
import {
  exitWithError,
  FetchService,
  getLogger,
  getValidPort,
  NestLogger,
  ProjectService,
  StoreService,
} from '@subql/node-core';
import { AppModule } from './app.module';
import { yargsOptions } from './yargs';
const pjson = require('../package.json');

const { argv } = yargsOptions;

const logger = getLogger('subql-node');

notifyUpdates(pjson, logger);

export async function bootstrap(): Promise<void> {
  logger.info(`Current ${pjson.name} version is ${pjson.version}`);
  const debug = argv.debug;

  const port = await getValidPort(argv.port);

  if (argv.unsafe) {
    logger.warn(
      'UNSAFE MODE IS ENABLED. This is not recommended for most projects and will not be supported by our hosted service',
    );
  }

  try {
    const app = await NestFactory.create(AppModule, {
      logger: new NestLogger(!!debug),
    });
    await app.init();

    const projectService: ProjectService = app.get('IProjectService');
    const fetchService = app.get(FetchService);

    // Initialise async services, we do this here rather than in factories, so we can capture one off eventss
    logger.debug(
      'Initializing project service, including unfinalized block recovery',
    );
    await projectService.init();
    logger.debug('Project service initialization completed');
    const storeService = app.get(StoreService);
    const { height: lastProcessedHeight } =
      await storeService.getLastProcessedBlock();
    // A startup rewind preserves its target block. Resume after that block,
    // even when node-core reports the rewind target as the project start height.
    const startHeight =
      lastProcessedHeight === undefined
        ? projectService.startHeight
        : Math.max(projectService.startHeight, lastProcessedHeight + 1);
    logger.debug(
      `Initializing fetch service: startSlot=${startHeight}, projectStartSlot=${
        projectService.startHeight
      }, lastProcessedHeight=${lastProcessedHeight ?? 'none'}`,
    );
    await fetchService.init(startHeight);
    logger.debug('Fetch service initialization completed');

    app.enableShutdownHooks();

    await app.listen(port);

    logger.info(`Node started on port: ${port}`);
  } catch (e) {
    exitWithError(new Error('Node failed to start', { cause: e }), logger);
  }
}
