// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {RegisteredTypes} from '@polkadot/types/types';
import {
  ISubstrateProjectManifest,
  SubstrateProjectNetworkConfig,
  SubstrateRuntimeDataSource,
  SubstrateNetworkFilter,
} from '../../types';

export type ProjectNetworkConfigV0_0_1 = SubstrateProjectNetworkConfig & RegisteredTypes;

export interface RuntimeDataSourceV0_0_1 extends SubstrateRuntimeDataSource {
  name: string;
  filter?: SubstrateNetworkFilter;
}

export interface ProjectManifestV0_0_1 extends ISubstrateProjectManifest {
  schema: string;
  network: ProjectNetworkConfigV0_0_1;
  dataSources: RuntimeDataSourceV0_0_1[];
}
