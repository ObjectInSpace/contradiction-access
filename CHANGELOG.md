# Changelog

## v1.0.0 — 2026-08-18

First release.

### Naming and roles

- Named every reachable control, taking words from the game's own text so a
  label cannot drift from what is on screen.
- Roles derived from what a handler **does**, not from markup: `mapmove`,
  `movebut`, `exitint`, `gomen` and friends are links; `gomap`, `mouseinv`,
  `subtog` and friends are buttons.
- Collapsed the redundant `<a href="#">` wrappers. `role="presentation"` is
  ignored on a focusable element, so the `href` is removed instead —
  otherwise the wrapper kept announcing as "index".
- Demoted single-cell layout tables to `role="presentation"` (46 elements).

### Reachability

- Controls that are rendered but cannot work are now hidden. This includes
  the "Ask about this" and "Replay answer" inventory icons, whose handlers
  are mutually exclusive and can both be dead — activating the wrong one
  produced a game error.
- Map pins, the close-map button and the map instruction text are reachable
  only while the map is genuinely open. The panel ships at `opacity:0.1` and
  the game does not hide it until the menu is first used, so a purely
  visual check reported it visible on the title screen.
- Gameplay text (`#paths`, `#newsbox`) is muted while a takeover screen
  covers it, and restored when it closes.

### Announcements

- Live regions (`polite`) on `#newstext`, `#m-detext`, `#m-invlist`,
  `#m-sumdets` and `#m-clue`, so text appearing elsewhere on the page is
  announced without the reading position being moved.

### Document-level fixes

- `lang="en-GB"` on `<html>`; the game shipped no `lang` at all.
- `alt=""` on four decorative images that sit beside their own text labels.
- `role="heading"` + `aria-level` on the three menu section titles.
- A/V slider `step` corrected from 1 to 10 to match the game's own 0–10
  scale; arrow keys previously appeared dead because each press moved a
  tenth of a step and was rounded away.
- Slider labels wired with `aria-labelledby` to the game's own text.

### Robustness

- A `MutationObserver` drives refreshes, with a 1s poll alongside it as a
  safety net after the observer was measured to miss the map opening.
