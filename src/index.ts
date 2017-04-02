#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import * as colors from 'colors';

const args = process.argv.slice(2);

if (1 !== args.length) {
    throw new Error('Parent branch not specified');
}

const parentBranch = args[0];
let result;

console.log(colors.yellow(`Merging ${parentBranch}`));

spawnProcess('git', ['merge', parentBranch], true);

try {
    console.log(colors.yellow('Ensuring composer.lock is the sole conflict'));

    result = spawnProcess('git', ['diff', '--name-only', '--diff-filter=U']);

    const conflictedFiles = result.stdout.toString().trim().split('\n');

    if (1 !== conflictedFiles.length || 'composer.lock' !== conflictedFiles[0]) {
        throw new Error(`composer.lock is not the sole conflict (${conflictedFiles.length} conflicts)`);
    }

    console.log(colors.yellow(`Checking out ${parentBranch} composer.lock`));

    spawnProcess('git', ['checkout', parentBranch, '--', 'composer.lock']);

    console.log(colors.yellow('Determining updated dependencies in HEAD'));

    result = spawnProcess('git', ['diff', 'MERGE_HEAD...HEAD', '--unified=0', '--', 'composer.json']);

    const dependencies: string[] = [];

    result.stdout.toString().split('\n').forEach((line) => {
        const matches = line.match(/^-\s+\"([^"]+)\"/);

        if (null === matches) {
            return;
        }

        dependencies.push(matches[1]);
    });

    console.log(colors.yellow(`Updating ${dependencies.length} composer dependencies: ${dependencies.join(', ')}`));

    dependencies.unshift('update');

    result = spawn('composer', dependencies);

    result.stdout.on('data', (data) => process.stdout.write(data.toString()));

    result.stderr.on('data', (data) => process.stderr.write(data.toString()));

    result.on('close', (code) => {
        if (0 !== code) {
            abortMerge();
            return;
        }

        console.log(colors.green('Successfully resolved composer.lock conflict'));
    });
} catch (e) {
    abortMerge();
}

function abortMerge() {
    console.log(colors.yellow('Aborting merge'));

    spawnProcess('git', ['merge', '--abort']);

    console.log(colors.red('Aborted merge'));
}

function spawnProcess(command: string, processArgs: string[], isGraceful: boolean = false) {
    const processResult = spawnSync(command, processArgs);

    if (!isGraceful && 0 !== processResult.status) {
        if ('undefined' !== typeof processResult.error) {
            throw processResult.error;
        } else {
            throw new Error(processResult.stderr.toString());
        }
    }

    return processResult;
}
