import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderCli = path.join(desktopRoot, 'node_modules', 'electron-builder', 'cli.js');
const bundled7Zip = path.join(
  desktopRoot,
  'node_modules',
  'electron-winstaller',
  'vendor',
  '7z.exe'
);

if (process.platform !== 'win32') {
  throw new Error('package:portable must be run on Windows.');
}

if (!fs.existsSync(bundled7Zip)) {
  throw new Error('The bundled 7-Zip helper is missing. Run npm install in apps/desktop first.');
}

const child = spawn(process.execPath, [builderCli, '--win', 'portable'], {
  cwd: desktopRoot,
  env: {
    ...process.env,
    ELECTRON_BUILDER_7ZIP_PATH: bundled7Zip
  },
  stdio: 'inherit'
});

child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`electron-builder stopped by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
