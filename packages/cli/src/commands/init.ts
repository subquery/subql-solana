// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import fs from 'fs';
import path from 'path';
import {Command, flags} from '@oclif/command';
import {fetchTemplates, Template} from '@subql/templates';
import cli from 'cli-ux';
import fuzzy from 'fuzzy';
import * as inquirer from 'inquirer';
import {createProject, installDependencies} from '../controller/init-controller';
import {getGenesisHash} from '../jsonrpc';
import {ProjectSpecBase, ProjectSpecV0_2_0} from '../types';

export default class Init extends Command {
  static description = 'Initialize a scaffold subquery project';

  static flags = {
    force: flags.boolean({char: 'f'}),
    starter: flags.boolean({
      default: true,
    }),
    location: flags.string({char: 'l', description: 'local folder to create the project in'}),
    'install-dependencies': flags.boolean({description: 'Install dependencies as well', default: false}),
    npm: flags.boolean({description: 'Force using NPM instead of yarn, only works with `install-dependencies` flag'}),
    specVersion: flags.string({
      required: false,
      options: ['0.0.1', '0.2.0'],
      default: '0.2.0',
      description: 'The spec version to be used by the project',
    }),
  };

  static args = [
    {
      name: 'projectName',
      description: 'Give the starter project name',
    },
  ];

  async run(): Promise<void> {
    const {args, flags} = this.parse(Init);
    const project = {} as ProjectSpecBase;

    const location = flags.location ? path.resolve(flags.location) : process.cwd();

    project.name = args.projectName
      ? args.projectName
      : await cli.prompt('Project name', {default: 'subql-starter', required: true});
    if (fs.existsSync(path.join(location, `${project.name}`))) {
      throw new Error(`Directory ${project.name} exists, try another project name`);
    }
    project.repository = await cli.prompt('Git repository', {required: false});

    project.endpoint = await cli.prompt('RPC endpoint', {
      default: 'wss://polkadot.api.onfinality.io/public-ws',
      required: true,
    });

    if (flags.specVersion === '0.2.0') {
      cli.action.start('Getting network genesis hash');
      (project as ProjectSpecV0_2_0).genesisHash = await getGenesisHash(project.endpoint);
      cli.action.stop();
    }

    // XXX: unsafe!
    const templates = (await fetchTemplates()) as Template[];
    const networks = templates
      .map((t) => t.network)
      .filter((n, i, self) => {
        return i === self.indexOf(n);
      });

    inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
    const networkResponse: {network: string} = await inquirer.prompt([
      {
        name: 'network',
        message: 'Select a network',
        type: 'autocomplete',
        source: (_: any, input: string) => {
          input = input || '';
          return new Promise((resolve) => {
            resolve(
              fuzzy.filter(input, networks).map((el) => {
                return el.original;
              })
            );
          });
        },
      },
    ]);

    const names = templates.filter((t) => t.network === networkResponse.network).map((t) => t.name);

    const nameResponse: {name: string} = await inquirer.prompt([
      {
        name: 'name',
        message: 'Select a template',
        type: 'autocomplete',
        source: (_: any, input: string) => {
          input = input || '';
          return new Promise((resolve) => {
            resolve(
              fuzzy.filter(input, names).map((el) => {
                return el.original;
              })
            );
          });
        },
      },
    ]);

    const template = templates.find((t) => t.name === nameResponse.name);

    project.author = await cli.prompt('Authors', {required: true});
    project.description = await cli.prompt('Description', {required: false});
    project.version = await cli.prompt('Version:', {default: '1.0.0', required: true});
    project.license = await cli.prompt('License:', {default: 'MIT', required: true});

    if (flags.starter && project.name) {
      try {
        cli.action.start('Init the starter package');
        const projectPath = await createProject(location, template, project);
        cli.action.stop();

        if (flags['install-dependencies']) {
          cli.action.start('Installing dependencies');
          installDependencies(projectPath, flags.npm);
          cli.action.stop();
        }

        this.log(`${project.name} is ready`);

        /*
         * Explicitly exit because getGenesisHash creates a polkadot api instance that keeps running
         * Disconnecting the api causes undesired logging that cannot be disabled
         */
        process.exit(0);
      } catch (e) {
        /* handle all errors here */
        this.error(e.message);
      }
    }
  }
}
