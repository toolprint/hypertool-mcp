#!/usr/bin/env node
/**
 * Development script that forwards CLI arguments to the compiled server
 */

const { spawn } = require('child_process');
const path = require('path');

// Get CLI arguments (skip node and script name)
const args = process.argv.slice(2);

// Start TypeScript compiler in watch mode
const tscProcess = spawn('npx', ['tsc', '--watch'], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

// Start nodemon with the arguments passed to this script
const nodemonArgs = [
  '--watch', 'dist',
  '--exec', `node dist/index.js ${args.join(' ')}`
];

const nodemonProcess = spawn('npx', ['nodemon', ...nodemonArgs], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

// Handle cleanup
process.on('SIGINT', () => {
  tscProcess.kill('SIGINT');
  nodemonProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  tscProcess.kill('SIGTERM');
  nodemonProcess.kill('SIGTERM');
  process.exit(0);
});
