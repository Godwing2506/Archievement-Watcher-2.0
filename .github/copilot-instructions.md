# Project guidance

- This repository is a JavaScript/Electron app with separate updater and watchdog packages. Follow the existing CommonJS and module boundaries.
- Run the main app tests from `app/`: `npm test -- --runInBand`.
- Install dependencies with the root `npm install.cmd`; build the installer with `buildme.cmd`.
- Preserve package manifests and lockfiles. The installer uses `setup/{{app}}/nw/nw.exe` for scheduled updater tasks; that directory is required.
- Treat `temp_*`, `tmp_*`, `node_modules`, and generated installer output as local build/test artifacts, not source.
- Keep parser behavior, localization fallbacks, and user-data paths compatible. Do not claim performance gains without measurements.
- Use the focused workflows under `.github/skills/` when they apply.
