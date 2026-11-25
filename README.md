# EZ Apps

The app store behind [EZ Launcher](https://github.com/TheMishez/EZ_Launcher).
The launcher reads `registry.json` from this repo.

## Publish or update an app

1. Put the app in `apps/<id>/`. The folder name must match `id` in its `manifest.json`.
2. Bump `version` in that `manifest.json`.
3. Push to `main`.

The **Publish apps** workflow then zips the app, creates a GitHub release named `<id>-<version>`, and rewrites `registry.json` with the download URL and sha256. The launcher refuses any zip whose sha256 doesn't match.

If you change an app without bumping its version, nothing is republished; the existing release is kept as-is.

## Apps

None published yet.

See the EZ Launcher README for the manifest format and the `window.ez` API.
