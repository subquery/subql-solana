// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {SubqlSolanaDatasource} from '@subql/types-solana';
import {plainToClass} from 'class-transformer';
import {ISolanaProjectManifest} from '../types';
import {ProjectManifestV0_0_1Impl} from './v0_0_1';

export type VersionedProjectManifest = {specVersion: string};

const SUPPORTED_VERSIONS = {
  '0.0.1': ProjectManifestV0_0_1Impl,
};

type Versions = keyof typeof SUPPORTED_VERSIONS;

type ProjectManifestImpls = InstanceType<typeof SUPPORTED_VERSIONS[Versions]>;

export function manifestIsV0_0_1(manifest: ISolanaProjectManifest): manifest is ProjectManifestV0_0_1Impl {
  return manifest.specVersion === '0.0.1';
}

export class ProjectManifestVersioned implements ISolanaProjectManifest {
  private _impl: ProjectManifestImpls;

  constructor(projectManifest: VersionedProjectManifest) {
    const klass = SUPPORTED_VERSIONS['0.0.1'];
    if (!klass) {
      throw new Error('specVersion not supported for project manifest file');
    }
    this._impl = plainToClass<ProjectManifestImpls, VersionedProjectManifest>(klass, projectManifest);
  }

  get asImpl(): ProjectManifestImpls {
    return this._impl;
  }

  get isV0_0_1(): boolean {
    return this.specVersion === '0.0.1';
  }

  get asV0_0_1(): ProjectManifestV0_0_1Impl {
    return this._impl as ProjectManifestV0_0_1Impl;
  }

  toDeployment(): string | undefined {
    return this.toDeployment();
  }

  validate(): void {
    // this._impl.validate();
  }

  get dataSources(): SubqlSolanaDatasource[] {
    return this._impl.dataSources;
  }

  get schema(): string {
    return this._impl.schema.file;
  }

  get specVersion(): string {
    return this._impl.specVersion;
  }

  get description(): string {
    return this._impl.description;
  }

  get repository(): string {
    return this._impl.repository;
  }
}
