# Masterpiece OS Desktop

Electron + React + TypeScript desktop client for the Masterpiece OS v5 analysis pipeline.

## Commands

Run from the repository root:

```powershell
npm run desktop:dev
npm run desktop:test
npm run desktop:build
npm run desktop:package
```

The Windows installer is written to `apps/desktop/release/`. A runnable unpacked build can be created with:

```powershell
npm --prefix apps/desktop run package:dir
```

If Electron or electron-builder assets are slow to download on a restricted network, install dependencies with the appropriate approved mirror configured in the shell. The repository does not store mirror credentials or model API keys.

## Security and data

- The renderer has no Node.js access. It communicates through the typed preload bridge and allow-listed IPC handlers.
- API keys are encrypted by Electron `safeStorage` and saved only under Electron's per-user data directory. Project metadata never contains a key.
- Imported ZIP paths and project file operations are checked against their expected root directories.
- Model requests are made only from the main process after an explicit user action.

## Pipeline boundary

The main process calls `runV5Pipeline` directly. It does not launch the CLI or assemble terminal commands. Desktop contributes project preparation, credentials, progress events, cancellation, and the Fusion Enhanced task profile; v5 remains the owner of visual preparation, reasoning, cache behavior, and official report generation.

The final report name follows:

```text
项目名称-视觉方案升级报告-模型名称.md
```

Invalid Windows filename characters are normalized before writing.

