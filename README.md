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

| App | Game | What it does |
|---|---|---|
| `cs2-hud` | CS2 | Mini HUD with HP, armor, money and round kills (Game State Integration) |
| `cs2-match-tracker` | CS2 | Everyone in your match with FACEIT level/Elo, Premier + Leetify ratings, win rate, K/D, and csrep/Leetify/FACEIT buttons (Alt+X). Needs launcher 0.2.0+ and `-netconport 2121`. |
| `poe2-whispers` | PoE2 | Shows incoming trade whispers over the game |

See the EZ Launcher README for the manifest format and the `window.ez` API.
