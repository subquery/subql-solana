// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import {loadSubstrateProjectManifest} from './load';

const projectsDir = path.join(__dirname, '../../test');

describe('project.yaml', () => {
  it('can parse project.yaml to ProjectManifestImpl', () => {
    expect(loadSubstrateProjectManifest(path.join(projectsDir, 'project.yaml'))).toBeTruthy();
  });

  it('can validate project.yaml', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_falsy.yaml'))).toThrow();
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_falsy_array.yaml'))).toThrow();
  });

  it('can validate a v0.2.0 project.yaml', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_0.2.0.yaml'))).not.toThrow();
  });

  it('can fail validation if version not supported', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_invalid_version.yaml'))).toThrow();
  });

  it('can validate a v0.2.0 project.yaml with a custom data source', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_0.2.0_custom_ds.yaml'))).not.toThrow();
  });

  it('can validate a v0.2.1 project.yaml with templates', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_0.2.1.yaml'))).not.toThrow();
  });

  it('can validate a v1.0.0 project.yaml with templates', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_1.0.0.yaml'))).not.toThrow();
  });

  it('can validate a v1.0.0 project.yaml with unsupported runner node', () => {
    expect(() => loadSubstrateProjectManifest(path.join(projectsDir, 'project_1.0.0_bad_runner.yaml'))).toThrow();
  });

  it('can validate a v1.0.0 project.yaml runner and datasource mismatches', () => {
    expect(() =>
      loadSubstrateProjectManifest(path.join(projectsDir, 'project_1.0.0_runner_ds_mismatch.yaml'))
    ).toThrow();
  });

  it('can fail validation if custom ds missing processor', () => {
    expect(() =>
      loadSubstrateProjectManifest(path.join(projectsDir, 'project_0.2.0_invalid_custom_ds.yaml'))
    ).toThrow();
  });
});
