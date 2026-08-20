# Arsenal Fireteam Builder — First Pass

A static, client-side prototype designed to deploy directly to GitHub Pages.

## Included in this pass

- Editable Threat limit (50 is only the default)
- Operation name
- Corporate Client selection with perk summary
- MCV profile, pilot experience, component, shield, sidearm, primary weapons and equipment
- Live derived MCV Speed / Defense / Armor / Actions
- Infantry catalog with instant add
- Quantity controls and removal
- Heavy Weapons Specialist weapon selection
- Drag-to-reorder infantry
- Orbital Ordnance selection
- Backup Machete support
- Dynamic construction limits:
  - Encom extra ordnance
  - Nile specialist allowance
  - Veteran loadout caps
  - Backup Machete infantry/specialist reductions
- Live Threat total and legality messages
- Browser save/current-list persistence via localStorage
- Native Arsenal roster JSON export/import
- Readable text export
- Basic Game Mode with Ready / Activated / Downed / KIA states
- New Recruit compatibility reserved as an adapter layer

## Run locally

Because the app loads `data/arsenal.json`, browsers should serve it over HTTP rather than opening `index.html` directly.

From this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages

The folder is intentionally static:

```text
index.html
styles.css
app.js
data/arsenal.json
```

It can be placed at the root of a GitHub Pages repository or inside `/docs` if Pages is configured to publish from that folder.

## Important first-pass limitations

- New Recruit `.rosz` import/export is not implemented yet. The internal roster schema is designed so a compatibility adapter can be added without changing the UI data model.
- Vanguard's copied Specialist profile / random secondary ability is represented in the data, but its configuration UI is not yet implemented.
- Game Mode currently tracks broad unit states only. Armor/ammo/reload/condition tracking can be added later.
- Saved-roster browsing/management is not yet surfaced as a full "My Fireteams" screen; Save persists the current roster and keeps a small saved history in localStorage.
- The UI has not yet been cross-browser/device tested beyond structural checks.

## Source data

`data/arsenal.json` is the consolidated dataset produced from:
1. Arsenal FAQ & Errata v1.2
2. Blaster Vol. 07: Arsenal
3. Official supplement content represented in the community GST
4. GST identifiers/structure for interoperability
