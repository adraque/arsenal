# Arsenal Builder — Dropdown + Right Scroll Fix Pass

Changes:
- Fixes native dropdowns closing immediately after opening.
  The global click handler now ignores native SELECT/OPTION interactions;
  those controls update only when their existing `change` handler fires.
- Restores independent scrolling on the right-side Active Fireteam panel
  when the roster is taller than the viewport.
- Keeps the floating Current MCV behavior on the left unchanged.

No roster rules, validation, exports, print behavior, MCV removal,
or MCV configuration logic changed.
