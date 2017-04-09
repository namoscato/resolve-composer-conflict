# Resolve Composer Conflict

Utility to automatically resolve [`composer.lock`](https://getcomposer.org/doc/01-basic-usage.md#installing-dependencies) git conflicts.

## Installation

```
npm i -g resolve-composer-conflict
```

## Usage

```
resolve-composer-conflict <branch>
```

1. Merges the specified _branch_ into the current branch if a merge is not already in progress
2. Prompts manual resolution of other conflicts if applicable
3. Resolves the `composer.lock` conflict by applying the current branch's updated dependencies to the merge branch's locked versions
4. Commits the merge with a description of the conflicting files
