# Masterpiece OS Desktop

Electron + React + TypeScript desktop client for the Masterpiece OS v5 analysis pipeline.

The analysis flow is intentionally focused: choose or drop a ZIP, image set, PDF, or folder, review and remove imported assets, choose an enabled API Profile, then click Start Analysis. ZIP files are read directly, only supported extracted assets are persisted, and duplicate content is removed by SHA-256. Original Logo assets are always locked and reports are always generated in Simplified Chinese.

`Provider` is a free-form profile identifier rather than a fixed vendor list. Users can label profiles for any vendor or deployment while independently configuring Base URL, Model ID, and API Key. The endpoint must expose an OpenAI-compatible Chat Completions multimodal API.

During a run, Desktop shows indeterminate activity, the current v5 stage, model, asset count, and a wall-clock timer. It never exposes hidden model reasoning or a fabricated percentage.

## Commands

Run from the repository root:

```powershell
npm run desktop:dev
npm run desktop:test
npm run desktop:build
npm run desktop:package
```

The default Windows artifact is a no-install Portable EXE written to `apps/desktop/release/`. Double-click it to run the current build without changing the installed applications on the machine.

A runnable unpacked development build can also be created with:

```powershell
npm --prefix apps/desktop run package:dir
```

For the fastest edit-and-run loop, use `npm run desktop:dev`. Use `npm run desktop:package` only when a refreshed standalone EXE is needed.

If Electron or electron-builder assets are slow to download on a restricted network, install dependencies with the appropriate approved mirror configured in the shell. The repository does not store mirror credentials or model API keys.

## Security and data

- The renderer has no Node.js access. It communicates through the typed preload bridge and allow-listed IPC handlers.
- Each API Profile has an independently encrypted key stored in a separate credential file under Electron's per-user data directory. Settings JSON, project metadata, runtime records, logs, and reports never contain a key.
- Imported ZIP paths and project file operations are checked against their expected root directories.
- The original ZIP is never retained in the project or sent to the model. Removing an asset or batch also invalidates the prepared contact sheet.
- Model requests are made only from the main process after an explicit user action.

## Pipeline boundary

The main process calls `runV5Pipeline` directly. It does not launch the CLI or assemble terminal commands. Desktop contributes project preparation, credentials, progress events, cancellation, and the Fusion Enhanced task profile; v5 remains the owner of visual preparation, reasoning, cache behavior, and official report generation.

The final project name is first inferred conservatively during intake, then finalized from the real name present in the same multimodal analysis result. Generic upload names such as `input`, `images`, or `assets` fall back to a timestamp until visual evidence provides a reliable name.

The final report name follows:

```text
项目名称-视觉方案升级报告-模型名称.md
```

Invalid Windows filename characters are normalized before writing.
