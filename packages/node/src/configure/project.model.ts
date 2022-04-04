// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { buildSchemaFromString, ReaderFactory } from '@subql/common';
import {
  loadSolanaProjectManifest,
  SolanaProjectNetworkConfig,
} from '@subql/common-solana';
import { ProjectManifestVersioned } from '@subql/common-solana/src/project/versioned';
import { SolanaProjectNetworkV0_0_1 } from '@subql/common-solana/src/project/versioned/v0_0_1';
import { SubqlSolanaDatasource } from '@subql/types-solana';
import { GraphQLSchema } from 'graphql';
import { getLogger } from '../utils/logger';
import { prepareProjectDir } from '../utils/project';
const logger = getLogger('configure');

export class SubquerySolanaProject {
  private _path: string;
  private _projectManifest: ProjectManifestVersioned;
  private _schema: GraphQLSchema;
  static async create(path: string): Promise<SubquerySolanaProject> {
    const projectPath = await prepareProjectDir(path);
    const projectManifest = loadSolanaProjectManifest(projectPath);
    // create GraphqlSchema from file.
    const reader = await ReaderFactory.create(path);
    const schemaString = await reader.getFile(projectManifest.schema);
    const schema = buildSchemaFromString(schemaString);

    return new SubquerySolanaProject(
      projectManifest as any,
      projectPath,
      schema,
    );
  }

  constructor(
    manifest: ProjectManifestVersioned,
    path: string,
    schema: GraphQLSchema,
  ) {
    this._projectManifest = manifest;
    this._path = path;
    this._schema = schema;

    console.log('manifest', manifest);
    console.log('manifest dataSources', manifest?.dataSources);
    manifest.dataSources?.forEach(function (dataSource) {
      // if (!(dataSource.kind in SubqlSolanaDatasourceKind)) {
      //   throw new Error(`Invalid datasource kind: "${dataSource.kind}"`);
      // }
      if (!dataSource.startBlock || dataSource.startBlock < 1) {
        if (dataSource.startBlock < 1) logger.warn('start block changed to #1');
        dataSource.startBlock = 1;
      }
    });
  }

  get projectManifest(): ProjectManifestVersioned {
    return this._projectManifest;
  }

  get network(): SolanaProjectNetworkConfig {
    const impl = this._projectManifest.asImpl;
    const network = {
      ...(impl.network as SolanaProjectNetworkV0_0_1),
    };

    if (!network.endpoint) {
      throw new Error(
        `Network endpoint must be provided for network. chainId="${network.chainId}"`,
      );
    }

    return network;
  }

  get path(): string {
    return this._path;
  }
  get dataSources(): SubqlSolanaDatasource[] {
    return this._projectManifest.dataSources as SubqlSolanaDatasource[];
  }
  get schema(): GraphQLSchema {
    return this._schema;
  }
}
