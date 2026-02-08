#!/usr/bin/env node
/**
 * Baseline Management Script
 * 
 * Usage:
 *   npx ts-node tests/fixtures/manage-baselines.ts list
 *   npx ts-node tests/fixtures/manage-baselines.ts update <baseline-name>
 *   npx ts-node tests/fixtures/manage-baselines.ts delete <baseline-name>
 *   npx ts-node tests/fixtures/manage-baselines.ts clean-diffs
 */

import * as fs from 'fs';
import * as path from 'path';

const baselineDir = path.join(__dirname, 'baselines');
const diffDir = path.join(__dirname, 'visual-diffs');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function listBaselines(): void {
    ensureDir(baselineDir);
    const files = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));

    if (files.length === 0) {
        console.log('No baselines found.');
        console.log('Run tests to create baselines automatically.');
        return;
    }

    console.log(`Found ${files.length} baseline(s):\n`);
    for (const file of files) {
        const stats = fs.statSync(path.join(baselineDir, file));
        const size = (stats.size / 1024).toFixed(1);
        const modified = stats.mtime.toISOString().split('T')[0];
        console.log(`  ${file.replace('.png', '')} (${size} KB, ${modified})`);
    }
}

function updateBaseline(name: string): void {
    const baselinePath = path.join(baselineDir, `${name}.png`);
    const diffPath = path.join(diffDir, `${name}-diff.png`);

    if (!fs.existsSync(baselinePath)) {
        console.error(`Baseline "${name}" does not exist.`);
        console.log('Available baselines:');
        listBaselines();
        process.exit(1);
    }

    // Delete the baseline to force regeneration on next test run
    fs.unlinkSync(baselinePath);
    console.log(`Deleted baseline: ${name}`);
    console.log('Run tests again to regenerate the baseline.');

    // Also clean up any diff image
    if (fs.existsSync(diffPath)) {
        fs.unlinkSync(diffPath);
        console.log(`Cleaned up diff: ${name}-diff.png`);
    }
}

function deleteBaseline(name: string): void {
    const baselinePath = path.join(baselineDir, `${name}.png`);

    if (!fs.existsSync(baselinePath)) {
        console.error(`Baseline "${name}" does not exist.`);
        process.exit(1);
    }

    fs.unlinkSync(baselinePath);
    console.log(`Deleted baseline: ${name}`);
}

function cleanDiffs(): void {
    ensureDir(diffDir);
    const files = fs.readdirSync(diffDir);

    if (files.length === 0) {
        console.log('No diff images to clean.');
        return;
    }

    for (const file of files) {
        fs.unlinkSync(path.join(diffDir, file));
    }
    console.log(`Cleaned ${files.length} diff image(s).`);
}

function printUsage(): void {
    console.log(`
Baseline Management Script

Usage:
  npx ts-node tests/fixtures/manage-baselines.ts <command> [args]

Commands:
  list                    List all baselines
  update <baseline-name>  Delete baseline to regenerate on next test run
  delete <baseline-name>  Permanently delete a baseline
  clean-diffs             Remove all diff images

Examples:
  npx ts-node tests/fixtures/manage-baselines.ts list
  npx ts-node tests/fixtures/manage-baselines.ts update canvas-text-element
  npx ts-node tests/fixtures/manage-baselines.ts clean-diffs
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'list':
        listBaselines();
        break;
    case 'update':
        if (!args[1]) {
            console.error('Error: baseline name required');
            printUsage();
            process.exit(1);
        }
        updateBaseline(args[1]);
        break;
    case 'delete':
        if (!args[1]) {
            console.error('Error: baseline name required');
            printUsage();
            process.exit(1);
        }
        deleteBaseline(args[1]);
        break;
    case 'clean-diffs':
        cleanDiffs();
        break;
    default:
        printUsage();
}
