#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import * as colors from 'colors';
import * as readlineSync from 'readline-sync';

const args = process.argv.slice(2);
const tab = '    ';

if (1 !== args.length) {
    console.log(colors.red('Usage: resolve-composer-conflict <branch>'));
    process.exit(1);
}

const parentBranch = args[0];
let result;

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

    updateDependencies(dependencies, allConflictedFiles);
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

function updateDependencies(dependencies: string[], allConflictedFiles: string[], isSubsequentAttempt = false) {
    console.log(colors.yellow(`Updating ${dependencies.length} Composer dependencies: ${dependencies.join(' ')}`));

    result = spawn('composer', ['update'].concat(dependencies));

    result.stdout.on('data', (data) => process.stdout.write(colors.yellow(data.toString())));

    result.stderr.on('data', (data) => process.stderr.write(colors.yellow(data.toString())));

    result.on('close', (code) => {
        if (0 !== code) {
            if (!isSubsequentAttempt) {
                console.log(colors.red('Failed to automatically update Composer dependencies\n'));
                console.log(`The following ${dependencies.length} dependencies that changed in your branch were unable to be updated:`); // tslint:disable:max-line-length
                console.log(`  - ${dependencies.join('\n  - ')}\n`);
            }

            console.log('Try manually running composer update again, or press enter to abort:');

            const input = readlineSync.question('> composer update ', { history: true });

            if (0 === input.length) {
                abortMerge('composer update failed');
            }

            return updateDependencies(input.split(' '), allConflictedFiles, true);
        }

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
}
