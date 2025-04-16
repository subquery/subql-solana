// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import path from 'node:path';
import {SolanaDatasourceKind, SubqlRuntimeDatasource} from '@subql/types-solana';
import rimraf from 'rimraf';
import {generateIDLInterfaces} from '.';

const outDir = path.join(__dirname, 'test-output');

describe('IDL Codegen', () => {
  afterEach(() => {
    rimraf.sync(outDir);
  });

  it('can generate an interface from an IDL', async () => {
    const ds: SubqlRuntimeDatasource = {
      kind: SolanaDatasourceKind.Runtime,
      startBlock: 0,
      assets: new Map([
        ['jupiter', {file: '../../../../node/test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json'}],
      ]),
      mapping: {
        file: '',
        handlers: [],
      },
    };

    const renderTemplate = jest.fn().mockImplementation((templatePath, outputPath, templateData) => {
      /* DO nothing*/
    });

    await expect(generateIDLInterfaces([ds], outDir, renderTemplate)).resolves.not.toThrow();

    expect(renderTemplate).toHaveBeenCalledWith(
      path.resolve(__dirname, '../../templates/idl.ts.ejs'),
      path.join(outDir, '/src/types/handler-inputs/jupiter.ts'),
      {
        props: {
          name: 'jupiter',
          instructions: [
            'Claim',
            'ClaimToken',
            'CloseToken',
            'CreateOpenOrders',
            'CreateProgramOpenOrders',
            'CreateTokenLedger',
            'CreateTokenAccount',
            'ExactOutRoute',
            'Route',
            'RouteWithTokenLedger',
            'SetTokenLedger',
            'SharedAccountsExactOutRoute',
            'SharedAccountsRoute',
            'SharedAccountsRouteWithTokenLedger',
          ],
        },
      }
    );
  });
});
