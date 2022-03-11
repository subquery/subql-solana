// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {ProjectManifestV1_0_0} from '@subql/common';
import {RuntimeDataSourceV0_3_0, CustomDatasourceV0_3_0} from '../v0_3_0';

export interface TerraProjectManifestV1_0_0
  extends ProjectManifestV1_0_0<never, RuntimeDataSourceV0_3_0 | CustomDatasourceV0_3_0> {
  name: string;
  version: string;
  schema: {
    file: string;
  };
  network: {
    endpoint?: string;
    dictionary?: string;
    chainId: string;
  };
}
