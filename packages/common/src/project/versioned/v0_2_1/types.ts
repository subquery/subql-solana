// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {baseDataSource} from '@subql/common';
import {ProjectManifestV0_2_0} from '../v0_2_0';

export interface ProjectManifestV0_2_1<T, D extends object = baseDataSource> extends ProjectManifestV0_2_0<D> {
  dataSources: D[];
  templates?: T[];
}
