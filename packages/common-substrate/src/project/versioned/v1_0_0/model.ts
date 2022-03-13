// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {NodeSpec, QuerySpec, RUNNER_REGEX, RunnerQueryBaseImpl, runnerSpecs} from '@subql/common';
import {CustomDataSourceV0_2_0Impl, RuntimeDataSourceV0_2_0Impl} from '@subql/common-substrate/project';
import {plainToClass, Type} from 'class-transformer';
import {Equals, IsArray, IsObject, IsString, Matches, ValidateNested, validateSync} from 'class-validator';
import {DeploymentV0_2_1, ProjectManifestV0_2_1Impl} from '../v0_2_1';
import {SubstrateProjectManifestV1_0_0} from './types';

const SUBSTRATE_NODE_NAME = `@subql/node`;

export class SubstrateRunnerNodeImpl implements NodeSpec {
  @Equals(SUBSTRATE_NODE_NAME)
  name: string;
  @Matches(RUNNER_REGEX)
  version: string;
}

export class SubstrateRunnerSpecsImpl implements runnerSpecs {
  @IsObject()
  @ValidateNested()
  @Type(() => SubstrateRunnerNodeImpl)
  node: NodeSpec;
  @IsObject()
  @ValidateNested()
  @Type(() => RunnerQueryBaseImpl)
  query: QuerySpec;
}

export class DeploymentV1_0_0 extends DeploymentV0_2_1 {
  @Equals('1.0.0')
  @IsString()
  specVersion: string;
  @IsObject()
  @ValidateNested()
  @Type(() => SubstrateRunnerSpecsImpl)
  runner: runnerSpecs;
}

export class ProjectManifestV1_0_0Impl extends ProjectManifestV0_2_1Impl implements SubstrateProjectManifestV1_0_0 {
  @IsObject()
  @ValidateNested()
  @Type(() => SubstrateRunnerSpecsImpl)
  runner: runnerSpecs;
  protected _deployment: DeploymentV1_0_0;

  get deployment(): DeploymentV1_0_0 {
    if (!this._deployment) {
      this._deployment = plainToClass(DeploymentV1_0_0, this);
      validateSync(this._deployment, {whitelist: true});
    }
    return this._deployment;
  }
}
