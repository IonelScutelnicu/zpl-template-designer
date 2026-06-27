#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');
const cacheDir = path.join(__dirname, 'labelary-cache');
const activeRunDir = path.join(cacheDir, '.active-run');

function resetActiveRunDir() {
    fs.rmSync(activeRunDir, { recursive: true, force: true });
    fs.mkdirSync(activeRunDir, { recursive: true });
}

function collectActiveKeys() {
    if (!fs.existsSync(activeRunDir)) {
        return new Set();
    }

    return new Set(
        fs.readdirSync(activeRunDir)
            .filter(file => file.endsWith('.seen'))
            .map(file => file.slice(0, -'.seen'.length))
    );
}

function pruneStaleCacheEntries() {
    const activeKeys = collectActiveKeys();
    if (activeKeys.size === 0) {
        console.log('No Labelary cache entries were requested; skipped pruning.');
        return;
    }

    if (!fs.existsSync(cacheDir)) {
        console.log('Labelary cache directory does not exist yet.');
        return;
    }

    const removedFiles = [];
    for (const file of fs.readdirSync(cacheDir)) {
        if (!file.endsWith('.png')) {
            continue;
        }

        const key = path.basename(file, '.png');
        if (activeKeys.has(key)) {
            continue;
        }

        fs.unlinkSync(path.join(cacheDir, file));
        removedFiles.push(file);
    }

    if (removedFiles.length === 0) {
        console.log('Labelary cache is already up to date.');
        return;
    }

    console.log(`Removed ${removedFiles.length} stale Labelary cache image(s).`);
}

function cleanup() {
    fs.rmSync(activeRunDir, { recursive: true, force: true });
}

function quoteWindowsArg(value) {
    if (value.length === 0) {
        return '""';
    }

    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function normalizePlaywrightArgs(rawArgs) {
    const normalizedArgs = [];
    const optionsWithValues = new Set(['-g', '--grep', '--grep-invert', '--project']);

    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (!optionsWithValues.has(arg)) {
            normalizedArgs.push(arg);
            continue;
        }

        const valueParts = [];
        index += 1;
        while (index < rawArgs.length && !rawArgs[index].startsWith('-')) {
            valueParts.push(rawArgs[index]);
            index += 1;
        }
        index -= 1;
        normalizedArgs.push(arg);
        if (valueParts.length > 0) {
            normalizedArgs.push(valueParts.join(' '));
        }
    }

    return normalizedArgs;
}

function run() {
    const extraArgs = normalizePlaywrightArgs(process.argv.slice(2));
    const command = process.platform === 'win32'
        ? (process.env.ComSpec || 'cmd.exe')
        : 'npx';
    const args = process.platform === 'win32'
        ? ['/d', '/s', '/c', ['npx', 'playwright', 'test', ...extraArgs].map(quoteWindowsArg).join(' ')]
        : ['playwright', 'test', ...extraArgs];

    resetActiveRunDir();

    const result = spawnSync(
        command,
        args,
        {
            cwd: repoRoot,
            stdio: 'inherit',
            env: {
                ...process.env,
                LABELARY_CACHE_PRUNE: '1',
            },
        }
    );

    try {
        if (result.error) {
            throw result.error;
        }

        if (result.status !== 0) {
            process.exitCode = result.status ?? 1;
        } else {
            pruneStaleCacheEntries();
        }
    } finally {
        cleanup();
    }
}

module.exports = {
    cacheDir,
    activeRunDir,
    resetActiveRunDir,
    collectActiveKeys,
    pruneStaleCacheEntries,
    cleanup,
};

if (require.main === module) {
    run();
}
