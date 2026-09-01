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

Download the latest release and **unzip all of it** — the installer needs the
`js` folder beside it. Then run **`Install.bat`**.

It finds your Steam copy automatically. If it cannot, it asks you to paste the
folder path — in Steam, right-click Contradiction → Manage → Browse local
files, and copy the address bar.

Then start the game as usual.

### Uninstall

Run **`Uninstall.bat`**. It restores the original `index.html` and removes the
mod.

### What the installer changes

Deliberately as little as possible:

- Copies `a11y.js` into the game's `package.nw\js\` folder.
- Adds **one line** to `index.html`, directly after the game's own `cc.js`
  line: `<script src="js/a11y.js" type="text/javascript"></script>`
- Backs the original `index.html` up to `index.html.orig` first, and never
  overwrites that backup on a later run.

The game's own code (`js/cc.js`) is never touched.

### Installing by hand

The four steps above are the whole procedure, if you would rather do it
yourself:

1. Copy **`js/a11y.js`** into the game's `package.nw\js\` folder, alongside
   the existing `cc.js`.

2. Open `package.nw\index.html` in a text editor. Near the very end, find:

       <script src="js/cc.js" type="text/javascript"></script>

   Add this line **directly after** it:

       <script src="js/a11y.js" type="text/javascript"></script>

3. Save, and start the game.

Copy `index.html` somewhere **outside** the game folder first, so you have a
backup Steam cannot overwrite.

To uninstall by hand, delete the `a11y.js` line again.

### If the mod stops working

**Verifying or updating the game through Steam removes the script tag**,
because Steam restores its own `index.html`. The mod goes quiet.

Nothing is broken — just run `Install.bat` again. It is safe to re-run any
number of times: it will not duplicate the tag, and it will not overwrite your
original backup.

There is no anti-cheat and no launch-time integrity check in this game, so the
only consequence of verifying files is that the mod needs reinstalling.

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

Worth reading before you buy the game.

- **Scenery and locations are not described.** The mod makes every *control*
  reachable and named, but it does not narrate what a room looks like.
- **A few puzzles need an inventory item used in the right place**, and those
  moments are signalled visually. Without a description of the scene there is
  no clear cue that a particular item is wanted there. This affects a small
  portion of the game, but it is a real gap — covering it properly would mean
  writing original descriptive text for every location.

Everything else — conversations, the contradiction mechanic, the map, menus
and options — is playable.

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

## Reporting a problem

Please open an issue. The most useful things to include:

- **Where you were** — which screen, menu, or location in the game.
- **What your screen reader said**, as close to word for word as you can
  manage, or what it said nothing about.
- **What you expected to hear instead.**
- Your screen reader and version.

"This control reads as *index*" or "this button is not reachable at all" are
exactly the reports worth sending — that is the bug class this mod exists to
fix.

---

## Licence

The mod's own code is MIT licensed — see [LICENSE](LICENSE).

**No game files are redistributed here.** The installer patches your own copy
of a game you own.

## Credits

Built by [ObjectInSpace](https://github.com/ObjectInSpace).

Not affiliated with Baggy Cat Ltd or the game's developers. Contradiction:
Spot The Liar is the property of Baggy Cat Ltd.
