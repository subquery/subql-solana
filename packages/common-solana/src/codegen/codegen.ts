// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import assert from 'node:assert';
import path from 'node:path';
import {renderVisitor} from '@codama/renderers-js';
import {SolanaDatasourceKind, SolanaHandlerKind, SubqlDatasource, SubqlRuntimeDatasource} from '@subql/types-solana';
import {pascalCase} from 'codama';
import {Data} from 'ejs';
import {parseIdlFromFile, findInstructionDiscriminatorByName} from './idl';

const INSTRUCTION_TEMPLATE_TS = path.resolve(__dirname, '../../templates/idl.ts.ejs');
const CODAMA_PATH = '/src/types/program-interfaces';
const IDL_PATH = '/src/types/handler-inputs';

export async function validateDiscriminators(
  dataSources: SubqlRuntimeDatasource[],
  projectPath: string
): Promise<void> {
  const issues: string[] = [];

  for (const ds of dataSources) {
    for (const handler of ds.mapping.handlers) {
      if (!handler.filter) {
        break;
      }
      switch (handler.kind) {
        case SolanaHandlerKind.Instruction: {
          if (handler.filter.discriminator && handler.filter.programId) {
            const fileRef = ds.assets?.get(handler.filter.programId);
            if (!fileRef) {
              issues.push(`Datasource has a handler with a discriminator but no IDL file reference`);
              continue;
            }

            const idlPath = path.join(projectPath, fileRef.file);
            const idl = await parseIdlFromFile(idlPath);

            if (!findInstructionDiscriminatorByName(idl.getRoot(), handler.filter.discriminator)) {
              issues.push(
                `Datasource has a handler with a discriminator ${handler.filter.discriminator} but no matching instruction found in IDL`
              );
            }
            // TODO check discriminator in IDL
          }
          break;
        }
        default:
        /* Do nothing, there is nothing extra to validate*/
      }
    }
  }

  assert(issues.length === 0, issues.join('\n'));
}

export async function generateIDLInterfaces(
  dataSources: SubqlDatasource[],
  projectPath: string,
  renderTemplate: (templatePath: string, outputPath: string, templateData: Data) => Promise<void>
): Promise<void> {
  const allAssets = new Map(
    dataSources.filter((ds) => ds.assets !== undefined).flatMap((ds) => Array.from(ds.assets!.entries()))
  );

  await validateDiscriminators(
    dataSources.filter((ds) => ds.kind === SolanaDatasourceKind.Runtime) as SubqlRuntimeDatasource[],
    projectPath
  );

  for (const [name, fileRef] of allAssets) {
    const idlPath = path.join(projectPath, fileRef.file);
    const idl = await parseIdlFromFile(idlPath);

    const output = path.join(projectPath, CODAMA_PATH, name);

    await idl.accept(renderVisitor(output, {}));

    const instructionNames = idl.getRoot().program.instructions.map((inst) => pascalCase(inst.name));

    await renderTemplate(INSTRUCTION_TEMPLATE_TS, path.join(projectPath, IDL_PATH, `${name}.ts`), {
      props: {
        name,
        instructions: instructionNames,
      },
    });

    console.log(`* IDL ${name} generated`);
  }
}
