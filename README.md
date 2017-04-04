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

1. Merges the specified _branch_ into the current branch
2. Resolves a sole `composer.lock` conflict
3. Commits the merge
