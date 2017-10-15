#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import * as colors from 'colors';
import * as fs from 'fs';
import * as readlineSync from 'readline-sync';

enum ComposerAction {
    update = 'update',
    remove = 'remove',
}

const args = process.argv.slice(2);
const tab = '    ';

if (1 !== args.length) {
    console.log(colors.red('Usage: resolve-composer-conflict <branch>'));
    process.exit(1);
}

const parentBranch = args[0];
let result: any;

result = spawnProcess('git', ['merge', 'HEAD'], true);

if (0 === result.status) { // If not currently in a merge
    console.log(colors.yellow(`Merging ${parentBranch}`));

    result = spawnProcess('git', ['pull', 'origin', parentBranch, '--quiet'], true);

    if (0 === result.status) {
        console.log(colors.green(result.stdout.toString()));
        process.exit();
    }

    result = result.stderr.toString();

    if (result.trim().length > 0) {
        console.log(colors.red(result));
        process.exit(1);
    }
}

try {
    console.log(colors.yellow('Checking if composer.lock is the only conflict'));

    let allConflictedFiles: string[] = null;
    let conflictedFiles: string[] = [];
    let hasConflicts = false;

    do {
        if (hasConflicts) {
            let output = 'composer.lock is not the only conflict\n\n';

            output += 'Manually resolve the conflicting files:\n';

            conflictedFiles.forEach((file) => {
                if ('composer.lock' === file) {
                    return;
                }

                output += `${tab}${file}\n`;
            });

            console.log(colors.red(output));

            if (!readlineSync.keyInYNStrict('Try again?')) {
                throw new Error(`${conflictedFiles.length - 1} other conflicting files`);
            }
        }

        result = spawnProcess('git', ['diff', '--name-only', '--diff-filter=U']);

        conflictedFiles = result.stdout.toString().trim().split('\n');

        if (null === allConflictedFiles) {
            allConflictedFiles = conflictedFiles;
        }

        hasConflicts = 1 !== conflictedFiles.length || 'composer.lock' !== conflictedFiles[0];
    } while (hasConflicts);

    console.log(colors.yellow(`Checking out ${parentBranch} composer.lock`));

    spawnProcess('git', ['checkout', `origin/${parentBranch}`, '--', 'composer.lock']);

    console.log(colors.yellow(`Saving current composer.json state`));

    const composerJson = fs.readFileSync('composer.json');

    result = JSON.parse(composerJson.toString());

    const dependencies = Object.assign(result.require, result['require-dev']);

    console.log(colors.yellow(`Checking out ${parentBranch} composer.json`));

    spawnProcess('git', ['checkout', `origin/${parentBranch}`, '--', 'composer.json']);

    result = JSON.parse(fs.readFileSync('composer.json', { encoding: 'utf8' }));

    const parentDependencies = Object.assign(result.require, result['require-dev']);

    console.log(colors.yellow(`Restoring previous composer.json state`));

    fs.writeFileSync('composer.json', composerJson);

    console.log(colors.yellow('Adding composer.json to git'));

    spawnProcess('git', ['add', 'composer.json']);

    console.log(colors.yellow('Determining updated dependencies in HEAD'));

    const dependenciesRemove: string[] = [];
    const dependenciesUpdate: string[] = [];

    for (const dependency in parentDependencies) {
        if (!parentDependencies.hasOwnProperty(dependency)) {
            continue;
        }

        if ('undefined' === typeof dependencies[dependency]) { // parent dependency no longer exists
            dependenciesRemove.push(dependency);
        } else if (parentDependencies[dependency] !== parentDependencies[dependency]) { // parent dependency was updated
            dependenciesUpdate.push(dependency);
        }

        delete dependencies[dependency];
    }

    for (const dependency in dependencies) { // find any new dependencies
        if (dependencies.hasOwnProperty(dependency)) {
            dependenciesUpdate.push(dependency);
        }
    }

    updateDependencies(ComposerAction.update, 'Updating', dependenciesUpdate)
        .then(() => updateDependencies(ComposerAction.remove, 'Removing', dependenciesRemove))
        .then(() => {
            console.log(colors.yellow('Committing merge'));

            result = spawnProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

            const headBranch = result.stdout.toString().trim();
            const commitMessage = `Merge branch '${parentBranch}' into '${headBranch}'\n` +
                `Conflicts in:\n${tab}${allConflictedFiles.join(`\n${tab}`)}`;

            spawnProcess(
                'git',
                [
                    'commit',
                    '-am',
                    commitMessage,
                ],
            );

            console.log(colors.green('Successfully resolved composer.lock conflict'));

            process.exit();
        });
} catch (e) {
    abortMerge(e.message);
}

function abortMerge(message: string) {
    console.log(colors.yellow('Aborting merge'));

    spawnProcess('git', ['merge', '--abort']);

    console.log(colors.red(`Unable to automatically resolve composer.lock conflict: ${message}`));

    process.exit(1);
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

function updateDependencies(
    action: ComposerAction,
    gerund: string,
    dependencies: string[],
    isSubsequentAttempt = false,
): Promise<void> {
    if (0 === dependencies.length) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        console.log(colors.yellow(`${gerund} ${dependencies.length} Composer dependencies: ${dependencies.join(' ')}`));

        result = spawn('composer', [].concat(action, dependencies));

        result.stdout.on('data', (data: Buffer) => process.stdout.write(colors.yellow(data.toString())));

        result.stderr.on('data', (data: Buffer) => process.stderr.write(colors.yellow(data.toString())));

        result.on('close', (code: number) => {
            if (0 === code) {
                return resolve();
            }

            if (!isSubsequentAttempt) {
                console.log(colors.red(`Failed to automatically ${action} Composer dependencies\n`));
                console.log(`The following ${dependencies.length} dependencies that changed in your branch were unable to be ${action}d:`); // tslint:disable:max-line-length
                console.log(`  - ${dependencies.join('\n  - ')}\n`);
            }

            console.log(`Try manually running composer ${action} again, or press enter to abort:`);

            const input = readlineSync.question(`> composer ${action} `, { history: true });

            if (0 === input.length) {
                abortMerge(`composer ${action} failed`);
            }

            return updateDependencies(action, gerund, input.split(' '), true);
        });
    });
}
