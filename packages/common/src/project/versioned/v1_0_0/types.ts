// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {Equals, IsString, Matches} from 'class-validator';
import {RUNNER_REGEX} from '../../../constants';
import {BaseDataSource} from '../base';
import {ProjectManifestV0_2_1, TemplateBase} from '../v0_2_1';

export interface RunnerSpecs {
  node: NodeSpec;
  query: QuerySpec;
}

export interface NodeSpec {
  name: string;
  version: string;
}

export interface QuerySpec {
  name: string;
  version: string;
}

export class RunnerQueryBaseImpl implements QuerySpec {
  @Equals('@subql/query')
  name: string;
  @IsString()
  @Matches(RUNNER_REGEX)
  version: string;
}

export interface ProjectManifestV1_0_0<T extends object = TemplateBase, D extends object = BaseDataSource>
  extends Omit<ProjectManifestV0_2_1<T, D>, 'network'> {
  dataSources: D[];
  runner: RunnerSpecs;
  templates?: T[];
  network: {
    genesisHash?: string;
    chainId?: string;
    endpoint?: string;
    dictionary?: string;
    chaintypes?: {
      file: string;
    };
  };
}
