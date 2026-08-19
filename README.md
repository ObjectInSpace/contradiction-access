# Contradiction: Spot The Liar — Screen Reader Access Mod

A screen reader accessibility mod for **Contradiction: Spot The Liar**
(Steam, AppID 373390).

The game is built with NW.js, so it is an HTML page plus JavaScript. This mod
is a single extra script. **It never modifies the game's own code** — removing
one line from `index.html` removes the mod completely.

Tested with **NVDA** on Windows.

---

## What it fixes

The game draws every control as two layers that never reference each other:

- a **text layer** — plain `<div>`s holding the words, with no click handler
- a **click layer** — empty `<a href="#">` elements carrying the handler

For a mouse this works. For a screen reader it fails completely: what you can
read is not clickable, and what is clickable has no name. All 32 nameless
links announced as **"index"** (the `href="#"` resolves to `index.html`).

This mod makes each control announce **once**, as a real control, with a real
name taken from the game's own words.

### Specifically

- **Every control named.** Exits, map pins, menu items, icons, sliders.
- **Roles from behaviour, not markup.** A control that travels somewhere is a
  link; one that acts in place is a button.
- **Controls that are on screen but not usable are hidden.** The game leaves
  several controls in the page when they cannot work — activating them threw
  a game error. They now appear only when they actually function.
- **Layout tables demoted.** The game uses single-cell `<table>` wrappers for
  positioning; without this every menu item announces as a data grid.
- **Live regions** on the response ticker, item details, inventory, summary
  and clue text, so text appearing elsewhere on the page is announced.
- **Gameplay text muted behind takeover screens**, so the menu does not read
  the exits and location behind it.
- **`lang="en-GB"`** so NVDA selects an English voice (the game shipped no
  `lang` at all).
- **Empty `alt`** on decorative icons that sit beside their own text label,
  so controls are not announced twice.
- **Headings** on the menu sections (OPTIONS / CHIEF CLUES / REPLAY SCENES)
  so `H` navigates between them.
- **Slider steps corrected.** The A/V sliders declared a step 10× finer than
  the game's own scale, so arrow keys appeared dead. They work now.

---

## Install

1. Find your game folder. On Steam: right-click the game → Manage → Browse
   local files. The default path is usually:

       C:\Program Files (x86)\Steam\steamapps\common\Contradiction

2. Copy **`js/a11y.js`** from this release into the game's `package.nw\js\`
   folder, alongside the existing `cc.js`.

3. Open `package.nw\index.html` in a text editor. Near the very end, find:

       <script src="js/cc.js" type="text/javascript"></script>

   Add this line **directly after** it:

       <script src="js/a11y.js" type="text/javascript"></script>

4. Save, and start the game.

### Back up first

Copy `index.html` somewhere **outside** the game folder before editing.
Steam's "Verify integrity of game files" will overwrite anything inside it.

### Uninstall

Delete the `<script src="js/a11y.js">` line from `index.html`. That is all —
the game's own files were never changed.

---

## Verifying it loaded

The mod exposes diagnostics on `window`:

- `a11yStatus()` — counts for every pass, plus the full boot log
- `a11yAudit()` — lists every reachable control with the name it would
  announce, nameless ones first
- `a11yRefresh()` — forces a refresh

Note that DevTools is **not available** in the shipped Steam build, so these
are mainly useful if you run the game under an NW.js SDK build.

---

## Known limitations

- **The tutorial tip overlay (`#tipbox`) is not fixed.** It has no keyboard
  route in the game at all — it is dismissed by mouse click or gamepad only —
  and its text is baked into image files, so there is nothing to read. Fixing
  the control alone would give you a button that dismisses an unreadable
  overlay.
- **No audio description.** The game is one long FMV; describing the visual
  action is a recording job, not something a script can do.
- **Focus does not move to newly opened panels.** This was attempted and
  removed: a programmatic `focus()` on a plain `<div>` does not reliably move
  NVDA's browse-mode cursor. Live regions are used instead, so new text is
  announced where it appears without your reading position being moved.
- Tested only against the **Steam** build. The Humble build differs and is
  not supported.

---

## Credits

Built by [ObjectInSpace](https://github.com/ObjectInSpace).

Not affiliated with Baggy Cat Ltd or the game's developers.
