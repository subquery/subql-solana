// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import fs from 'node:fs';
import path from 'node:path';
import {AnchorIdl, rootNodeFromAnchor} from '@codama/nodes-from-anchor';
import {renderVisitor} from '@codama/renderers-js';
import {SubqlDatasource} from '@subql/types-solana';
import {Codama, createFromRoot, RootNode, pascalCase} from 'codama';
import {Data} from 'ejs';

const INSTRUCTION_TEMPLATE_TS = path.resolve(__dirname, '../../templates/idl.ts.ejs');
const CODAMA_PATH = '/src/types/program-interfaces';
const IDL_PATH = '/src/types/handler-inputs';

export function getIDLInterface(projectPath: string, idlFileName: string): unknown {
  throw new Error('Not implemented');
}

export type Idl = AnchorIdl | RootNode;

export function parseIdl(idl: Idl): Codama {
  let codama = createFromRoot(rootNodeFromAnchor(idl as AnchorIdl));
  // Check if the idl was an anchor idl
  if (codama.getRoot().program.publicKey === '') {
    codama = createFromRoot(idl as RootNode);
  }

  return codama;
}

export async function generateIDLInterfaces(
  dataSources: SubqlDatasource[],
  projectPath: string,
  renderTemplate: (templatePath: string, outputPath: string, templateData: Data) => Promise<void>
): Promise<void> {
  const allAssets = new Map(
    dataSources.filter((ds) => ds.assets !== undefined).flatMap((ds) => Array.from(ds.assets!.entries()))
  );

  for (const [name, fileRef] of allAssets) {
    const idlPath = path.join(projectPath, fileRef.file);
    const idlJSON = JSON.parse(await fs.promises.readFile(idlPath, 'utf-8'));

    const idl = parseIdl(idlJSON);

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
