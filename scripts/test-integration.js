#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const command = 'pnpm exec vitest run src/__tests__/readme-concepts.test.ts';

const result = spawnSync(command, {
    stdio: 'inherit',
    env: process.env,
    shell: true,
});

if (result.error) {
    console.error('[test-integration] Failed to execute vitest:', result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
