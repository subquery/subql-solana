// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { NestFactory } from '@nestjs/core';
import { exitWithError, FetchService, StoreService } from '@subql/node-core';
import { bootstrap } from './init';

jest.mock('@nestjs/core', () => ({ NestFactory: { create: jest.fn() } }));
jest.mock('@subql/common', () => ({ notifyUpdates: jest.fn() }));
jest.mock('@subql/node-core', () => ({
  exitWithError: jest.fn(),
  FetchService: class {},
  StoreService: class {},
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  getValidPort: jest.fn().mockResolvedValue(3000),
  NestLogger: class {},
}));
jest.mock('./app.module', () => ({ AppModule: class {} }));
jest.mock('./yargs', () => ({ yargsOptions: { argv: {} } }));

describe('bootstrap indexing start height', () => {
  it.each([
    { startHeight: 100, lastProcessedHeight: 100, expected: 101 },
    { startHeight: 500, lastProcessedHeight: undefined, expected: 500 },
    { startHeight: 105, lastProcessedHeight: 100, expected: 105 },
  ])(
    'starts at $expected with project start $startHeight and processed height $lastProcessedHeight',
    async ({ expected, lastProcessedHeight, startHeight }) => {
      const projectService = { init: jest.fn(), startHeight };
      const fetchService = { init: jest.fn() };
      const storeService = {
        getLastProcessedBlock: jest
          .fn()
          .mockResolvedValue({ height: lastProcessedHeight }),
      };
      const app = {
        init: jest.fn(),
        get: jest.fn((token) => {
          if (token === 'IProjectService') return projectService;
          if (token === FetchService) return fetchService;
          if (token === StoreService) return storeService;
          throw new Error(`Unexpected provider ${token}`);
        }),
        enableShutdownHooks: jest.fn(),
        listen: jest.fn(),
      };
      (NestFactory.create as jest.Mock).mockResolvedValue(app);

      await bootstrap();

      expect(fetchService.init).toHaveBeenCalledWith(expected);
      expect(exitWithError).not.toHaveBeenCalled();
    },
  );
});
