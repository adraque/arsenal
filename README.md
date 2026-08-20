# Arsenal Fireteam Builder - Layout Pass

This is the functional/layout pass built on the previous dark-theme version.

## Changes

- Removes `TH` from individual item costs; overall totals still use the word `Threat`.
- Removes the provisional MCV Pilot Experience selector from roster construction.
- Pilot tab remains the place to hire the actual Green, Experienced, and Veteran Pilot infantry models.
- Builder MCV stats show chassis/hardware only.
- Game Mode can select which hired Pilot is currently mounted; Pilot-derived Armor, Tactics, and Actions are applied there dynamically.
- MCV Profile, Integrated Component, Shield, Sidearm, Primary Weapon, Equipment, and Backup MCV choices are displayed one per descriptive row.
- Exclusive choices use `Select`; additive choices use square `+` / `✓` controls.
- Selected rows are highlighted.
- Corporate Client cards no longer display internal effect classifications.
- Individual cost numbers are right-aligned.

## Local test

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub

Replace the corresponding files in the repository, then:

```bash
git add .
git commit -m "Refine Arsenal builder layout"
git push
```

## Pilot/MCV rules note

The Pilot/MCV relationship remains provisional pending clarification from SkullForge. This pass does not introduce an assigned-Pilot roster relationship.
