#!/usr/bin/env node
/**
 * Deletes all baseline images and reruns the tests to regenerate them.
 *
 * Usage:
 *   npm run baselines
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const baselineDir = path.join(__dirname, 'baselines');

const files = fs.existsSync(baselineDir)
    ? fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'))
    : [];

if (files.length === 0) {
    console.log('No baselines found.');
} else {
    for (const file of files) {
        fs.unlinkSync(path.join(baselineDir, file));
    }
    console.log(`Deleted ${files.length} baseline(s). Regenerating...`);
}

execSync('npx playwright test', { stdio: 'inherit', cwd: path.join(__dirname, '../..'), env: { ...process.env, GENERATE_BASELINES: '1' } });
