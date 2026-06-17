#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');
const entry = path.resolve(__dirname, '..', 'clients', 'cli', 'index.ts');
const child = spawn(tsx, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: true
});
child.on('exit', (code) => process.exit(code ?? 1));
