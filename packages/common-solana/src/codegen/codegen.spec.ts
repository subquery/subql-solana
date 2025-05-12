// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import path from 'node:path';
import {SolanaDatasourceKind, SolanaHandlerKind, SubqlRuntimeDatasource} from '@subql/types-solana';
import rimraf from 'rimraf';
import {generateIDLInterfaces, validateDiscriminators} from './codegen';

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

  describe('validating discriminators agains IDLs', () => {
    it('can validate that a discriminator is part of an IDL', async () => {
      const ds: SubqlRuntimeDatasource = {
        kind: SolanaDatasourceKind.Runtime,
        startBlock: 0,
        assets: new Map([
          [
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            {file: '../../../../node/test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json'},
          ],
        ]),
        mapping: {
          file: '',
          handlers: [
            {
              handler: 'handleClaimToken',
              kind: SolanaHandlerKind.Instruction,
              filter: {
                programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
                discriminator: 'ClaimToken',
              },
            },
          ],
        },
      };

      await expect(validateDiscriminators([ds], outDir)).resolves.not.toThrow();
    });

    it('throws when an idl does not include the discriminator', async () => {
      const ds: SubqlRuntimeDatasource = {
        kind: SolanaDatasourceKind.Runtime,
        startBlock: 0,
        assets: new Map([
          [
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            {file: '../../../../node/test/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4.idl.json'},
          ],
        ]),
        mapping: {
          file: '',
          handlers: [
            {
              handler: 'handleClaimToken',
              kind: SolanaHandlerKind.Instruction,
              filter: {
                programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
                discriminator: 'InvalidDiscriminator',
              },
            },
          ],
        },
      };

      await expect(validateDiscriminators([ds], outDir)).rejects.toThrow(
        'Datasource has a handler with a discriminator InvalidDiscriminator but no matching instruction found in IDL'
      );
    });

    it('throws when there is no IDL', async () => {
      const ds: SubqlRuntimeDatasource = {
        kind: SolanaDatasourceKind.Runtime,
        startBlock: 0,
        mapping: {
          file: '',
          handlers: [
            {
              handler: 'handleClaimToken',
              kind: SolanaHandlerKind.Instruction,
              filter: {
                programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
                discriminator: 'ClaimToken',
              },
            },
          ],
        },
      };

      await expect(validateDiscriminators([ds], outDir)).rejects.toThrow(
        'Datasource has a handler with a discriminator but no IDL file reference'
      );
    });
  });
});
