// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {baseDataSource} from '@subql/common';
import {ProjectManifestV0_2_1} from '../v0_2_1';

export interface runnerSpecs {
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

export interface ProjectManifestV1_0_0<T, D extends object = baseDataSource>
  extends Omit<ProjectManifestV0_2_1<T, D>, 'network'> {
  dataSources: D[];
  runner: runnerSpecs;
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
