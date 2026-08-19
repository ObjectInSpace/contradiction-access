/* ==========================================================================
   Contradiction: Spot The Liar  --  screen reader access mod
   Phase 1: markup and semantics                  (Steam build, NW.js / Cr84)

   THE PROBLEM THIS SOLVES
   The game draws every screen as two parallel layers that never reference
   each other:

     - a TEXT layer  (#op_A / #opt_A ...) -- plain divs, no handlers. The
       words are here, but they are not controls, so a screen reader
       announces them as ordinary clickable text you cannot select.

     - a CLICK layer (#A_click ...)       -- real <a href="#"> elements with
       the onclick handlers. These are focusable and selectable, but they are
       COMPLETELY EMPTY, so they have no accessible name. With href="#" the
       name falls back to the URL, which is why all 32 nameless links
       announce as "index".

   Positioned on top of each other, this works for a mouse and fails totally
   for a screen reader: what you can read is not clickable, and what is
   clickable has no text.

   THE FIX
   Give the click layer the text layer's words via aria-label, and hide the
   now-redundant text layer from the accessibility tree so each control is
   announced ONCE, as a real control, with a real name.

   Labels that change per location (the four exits) are re-synced whenever
   the game rewrites the option text. Everything else is static and is
   labelled once at boot.

   js/cc.js is never modified. Removing the <script> tag removes this mod.
   ========================================================================== */

(function () {
  "use strict";

  var logged = [];
  function log(m) {
    logged.push(m);
    if (window.console && console.log) console.log("[a11y] " + m);
  }

  function $(id) { return document.getElementById(id); }

  /* Set an accessible name, and make sure the element is really a control.
     `role` is passed for things that act as buttons rather than navigation,
     so they are not announced as links to nowhere. */
  function label(node, text, role) {
    if (!node || !text) return false;
    node.setAttribute("aria-label", text);
    if (role) node.setAttribute("role", role);
    return true;
  }

  /* =======================================================================
     THE A/V SLIDERS

     Two <input type="range"> controls in the A/V options panel. Two separate
     problems, both pre-existing:

     1. THEY DO NOT RESPOND TO ARROW KEYS.
        The input has the implicit range 0-100 with step 1, but the game
        stores the setting as 0-10. Every oninput does a round trip:

            arrow moves the thumb   70 -> 71
            avmus = Math.round(71/10)  ->  still 7
            musit() writes value = 10*7  ->  snaps back to 70

        So one press moves the thumb by one unit and the game immediately
        drags it back. Nothing changes and nothing is audible. A mouse drag
        works only because it crosses a rounding boundary in one gesture.

        Declaring step="10" aligns the control with the game's own scale:
        one press moves 70 -> 80, Math.round(80/10) = 8, and the write-back
        produces the same 80. No snap, and the setting actually changes.
        This also makes the announced value honest -- the control currently
        claims a 1% granularity it does not have.

     2. THEY HAVE NO ACCESSIBLE NAME.
        The wording is already on screen ("Ambient Music Volume") as a bare
        text node inside #mid14 / #mid15, but nothing associates it with the
        input, so the slider announces as just a percentage. The text is
        wrapped in a span purely so aria-labelledby has something to point
        at -- the words themselves are the game's, not copied into an
        attribute, so they cannot drift out of sync.

     #m-vcor (Video Loop Correction) is deliberately NOT included: it has no
     oninput handler at all, so moving it does nothing. The game adjusts that
     setting only through Shift+Left/Right, and writes the result back into
     the slider for display. Giving it working arrows would imply a control
     the game does not actually offer.
     ======================================================================= */
  var AV_SLIDERS = [
    { input: "m-vob1", panel: "mid14" },
    { input: "m-vob2", panel: "mid15" }
  ];

  /* Wrap a container's leading text node in a span so it can be referenced.
     Returns the span's id, or "" if there is no text to wrap. */
  function nameFrom(panel) {
    if (!panel) return "";
    var existing = panel.querySelector && panel.querySelector(".a11y-name");
    if (existing) return existing.id;

    var kids = panel.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      // nodeType 3 == text node
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) {
        var span = document.createElement("span");
        span.className = "a11y-name";
        span.id = panel.id + "-name";
        span.appendChild(document.createTextNode(n.nodeValue.trim()));
        panel.replaceChild(span, n);
        return span.id;
      }
    }
    return "";
  }

  function fixSliders() {
    var fixed = 0, named = 0;
    for (var i = 0; i < AV_SLIDERS.length; i++) {
      var s = $(AV_SLIDERS[i].input);
      if (!s) { log("slider not found: " + AV_SLIDERS[i].input); continue; }

      // Match the control's granularity to the game's 0-10 scale, so an
      // arrow press survives the write-back instead of being cancelled.
      s.setAttribute("min", "0");
      s.setAttribute("max", "100");
      s.setAttribute("step", "10");
      fixed++;

      var id = nameFrom($(AV_SLIDERS[i].panel));
      if (id) { s.setAttribute("aria-labelledby", id); named++; }
      else log("no label text found for " + AV_SLIDERS[i].input);
    }
    return { fixed: fixed, named: named };
  }

  /* ---------------------------------------------------------------------
     ACTIVATION

     The game puts its onclick on the INNER div, inside an <a href="#"> that
     carries no handler of its own:

         <a href="#"><div id="iconMap" onclick="gomap()"></div></a>

     So naming the <a> makes the control announce correctly and then do
     NOTHING when activated -- Enter follows the empty href instead of
     reaching the div's handler. The name and the action must live on the
     same element.

     The fix is NOT to add a key handler to the wrapper. In browse mode a
     screen reader intercepts Enter and Space itself and activates the
     element its cursor is on, so a keydown listener never runs -- and the
     control still does nothing. Adding key handling only helps a sighted
     keyboard user.

     Instead, make the element that CARRIES the handler be the control: give
     it the accessible name and a role, so the screen reader's own
     activation lands on the element whose onclick actually does the work.
     The wrapping <a href="#"> is then redundant and is taken out of the tab
     order so the same control is not presented twice.

     No key handling is added. The game already binds a global keydown
     handler and treats the arrow keys as its own navigation, so a mod-level
     key listener would either be swallowed or fight it. Activation is left
     entirely to the screen reader acting on a correctly-named control. */
  function handler(node) {
    if (!node) return null;
    if (node.getAttribute && node.getAttribute("onclick")) return node;
    if (node.onclick) return node;
    // look one level down: <a><div onclick=...></div></a>
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].getAttribute && kids[i].getAttribute("onclick")) return kids[i];
      if (kids[i].onclick) return kids[i];
    }
    return null;
  }

  /* Make the element that owns the onclick into the real, named control.

     Returns the element a screen reader will present. Browse-mode
     activation lands on whatever element carries the name and role, so that
     element must be the one whose handler does the work. */
  function makeControl(wrapper, text, role) {
    var act = handler(wrapper) || wrapper;

    label(act, text, role || "button");
    // A <div> is not focusable without this. Remembered separately so the
    // show/hide gate can restore the right value rather than dropping the
    // element out of the tab order for good.
    act._a11yTabindex = "0";
    act.setAttribute("tabindex", "0");

    /* Collapse the redundant <a href="#"> wrapper.

       role="presentation" is IGNORED on a focusable element, and an <a> with
       an href is inherently focusable -- the browser keeps the link role no
       matter what we declare. That is why these wrappers kept announcing as
       "index" (the href resolves to index.html, so the URL becomes the name).

       Removing the href is what actually works: an <a> without href is not a
       link, is not focusable, and drops out of the accessibility tree as a
       plain inline element. The game never relies on the href -- navigation
       is done entirely by the onclick on the inner div. */
    if (act !== wrapper && wrapper.tagName === "A") {
      wrapper.removeAttribute("href");
      wrapper.setAttribute("role", "presentation");
      wrapper.setAttribute("tabindex", "-1");
      wrapper.removeAttribute("aria-label");
      wrapper.removeAttribute("aria-labelledby");
    }
    return act;
  }


  /* Flatten the game's markup into a plain string, for aria-label (which
     takes no markup).

     The exits use this too, via linkTo(). aria-labelledby was tried there
     and reverted: the name source has to be hidden or its words also sit on
     the page as loose text and every exit is announced twice -- but the game
     writes opt_A/opt_B as bare text and opt_C/opt_D wrapped in a <table>,
     and resolving a name through a presentational table inside a hidden
     element left C and D unnamed. An explicit string has no reach-through.

     <br> becomes a space. Handles both forms the game emits, so a
     table-wrapped option yields the same name as a bare one. */
  function clean(html) {
    if (html === null || typeof html === "undefined") return "";
    return String(html)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#8217;|&rsquo;/gi, "’")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Point a control at existing text as its accessible name.

     This is the semantic route: the words stay in the element the game
     already writes to, and the control references them. Nothing is copied,
     so the name cannot drift out of sync with what is on screen, and the
     text keeps its own structure rather than being flattened into an
     attribute.

     The game's single-cell <table> wrappers are pure layout -- a pre-flexbox
     vertical-centering trick, with no <th>, <caption> or <thead> anywhere in
     the build. Left alone, a screen reader would announce "table with 1 row
     and 1 column" before every option. role="presentation" strips that
     false structure while leaving the words and their <br> breaks intact. */
  function linkTo(control, textNode, role) {
    if (!control || !textNode) return false;
    if (!textNode.id) return false;
    /* Name the control with an EXPLICIT aria-label taken from the text,
       rather than aria-labelledby pointing at it.

       Why the change: the text node also has to be hidden, or its words sit
       on the page as loose text and every exit is announced twice (once as
       the link, once as stray text). But hiding the name SOURCE made "some
       links unlabeled" -- and the difference is in how the game writes them:

         opt_A / opt_B   innerHTML = bare text
         opt_C / opt_D   innerHTML = "<table><tr><td>" + text + "</td></tr></table>"

       demoteTables() then marks that table role=presentation. Resolving a
       name through a presentational table inside an aria-hidden container is
       exactly where implementations diverge, which is why A and B kept their
       names while C and D lost theirs.

       An explicit aria-label has no reach-through: the string is computed
       here, from the same clean() the rest of the mod uses, so a hidden
       source cannot break it.

       COST, stated honestly: the name is now a COPY, so it must be re-synced
       whenever the game rewrites the text. That is already guaranteed --
       syncExits() runs on every words("opt_X") write via hookWords(), and
       the MutationObserver is a backstop. Nothing else writes these nodes. */
    var name = clean(textNode.innerHTML);
    if (!name) return false;                 // empty slot: caller hides it
    control.setAttribute("aria-label", name);
    control.removeAttribute("aria-labelledby");
    if (role) control.setAttribute("role", role);
    /* Now safe to hide the text: the name is an explicit string on the
       control, so nothing has to read through this element. This is what
       stops each exit being announced twice -- once as the link, once as
       loose text on the page. */
    textNode.setAttribute("aria-hidden", "true");
    demoteTables(textNode);
    return true;
  }

  /* WCAG 3.1.1 Language of Page (A).

     The game ships a bare <html> with no lang attribute. A screen reader
     picks its speech synthesiser from this, so without it the game is read
     in whatever the user's default language happens to be -- English
     dialogue voiced by, say, a German synthesiser is close to unusable.

     ENGLISH-ONLY -- verified, not assumed:
       - one <track> (index.html:288), one .vtt on disk
       - cc.js has NO localization machinery: zero matches for lang*,
         locale*, i18n, translat*. No string table, no language switch.
       - all UI text is hardcoded English in the markup ("Watch Prologue",
         "Subtitles Off (S)", "RESUME") -- literal text nodes, not keys
       - sub.vtt is English; exactly one distinct non-ASCII char, "£" x9
     So this is a constant, not something to detect at runtime.

     NOTE: Contradiction/locales/ holds 106 .pak files. Those are CHROMIUM's
     own runtime strings, shipped with every NW.js app. They are NOT evidence
     of game localization -- do not reason from them.

     en-GB rather than plain en: the game is British (Edenton, "£",
     "Detective Inspector", British narration), and some synthesisers select
     a regional voice from the subtag. Plain "en" would also be correct;
     this is the more precise of two right answers. */
  function setPageLanguage() {
    var h = document.documentElement;
    if (!h) return false;
    if (h.getAttribute("lang")) return false;   // already set; leave it alone
    h.setAttribute("lang", "en-GB");
    return true;
  }

  /* WCAG 1.1.1 Non-text Content (A).

     Four <img> elements, none with an alt attribute. Three of them
     (IconHand/IconAsk/IconRep) sit in the same table row as their own text
     label -- "Try using this", "Ask about this", "Replay answer".

     They are therefore DECORATIVE DUPLICATES, and the correct fix is
     alt="" (empty), not a description. Describing them would make the
     screen reader announce each control twice: "Try using this, hand icon".
     An empty alt removes the image from the tree and leaves the real text
     to name the control.

     #tipimg is different: its src is filled in at runtime and it is the
     only content of #tipbox. It gets alt="" here too, because #tipbox
     itself needs to become a properly named control -- naming the image
     instead would put the name on the wrong element. See audit item A6;
     that fix is not part of this pass. */
  var DECORATIVE_IMAGES = ["tipimg"];

  function silenceDecorativeImages() {
    var n = 0, i;

    // The three icons have no ids, so they are found by their src.
    var byIcon = ["IconHand", "IconAsk", "IconRep"];
    var imgs = document.getElementsByTagName("img");
    for (i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute("src") || "";
      var decorative = false;
      for (var k = 0; k < byIcon.length; k++) {
        if (src.indexOf(byIcon[k]) !== -1) decorative = true;
      }
      if (imgs[i].id && DECORATIVE_IMAGES.indexOf(imgs[i].id) !== -1) {
        decorative = true;
      }
      if (!decorative) continue;
      if (imgs[i].getAttribute("alt") !== null) continue;  // already named
      imgs[i].setAttribute("alt", "");
      n++;
    }
    return n;
  }

  /* =======================================================================
     STRUCTURE: landmarks, headings, dialogs
     WCAG 1.3.1 (A), 2.4.1 Bypass Blocks (A), 2.4.6 Headings and Labels (AA)

     The game ships ZERO landmarks, ZERO headings and ZERO labels in 652
     lines. Landmark navigation (NVDA's D) and heading navigation (H) are the
     two main ways to orient on an unfamiliar screen, and neither has
     anything to jump to. On a panel like the main menu that means walking
     the whole thing linearly to find out what is on it.

     Nothing here restructures the DOM. Every element below already exists
     and is already positioned; only attributes are added. Position is
     load-bearing in this layout (absolute offsets everywhere), so moving or
     wrapping elements would break the visual game.

     WHICH CONTAINERS ARE MODAL -- verified from cc.js, not guessed:

       #m-menu       turnon/turnoff as a unit, paired with don/doff on
                     #menuDark, a full-screen backdrop. Genuine modal.
       #backinfo     gomen(2) -> menon=2, preceded by don("menuDark")
       #instructions gomen(3) -> menon=3, preceded by don("menuDark")
       #m-vidops     gomen(4) -> menon=4, preceded by don("menuDark")

     The three sub-screens are reached from the menu and share its backdrop,
     so each is its own dialog.

     The three headed sections (OPTIONS / CHIEF CLUES / REPLAY SCENES) are
     NOT dialogs: they are regions INSIDE #m-menu, shown and hidden with it.
     They get headings, not dialog roles. Getting this backwards would
     announce one screen as three overlapping dialogs.
     ======================================================================= */
  var HEADINGS = [
    { id: "m-ophead",    level: "2" },   // OPTIONS
    { id: "m-cluehead",  level: "2" },   // CHIEF CLUES
    { id: "m-scenehead", level: "2" }    // REPLAY SCENES
  ];

  function markHeadings() {
    var n = 0;
    for (var i = 0; i < HEADINGS.length; i++) {
      var el = $(HEADINGS[i].id);
      if (!el) { log("heading not found: " + HEADINGS[i].id); continue; }
      // role=heading needs aria-level; without it the level is undefined and
      // NVDA cannot place it in the document outline.
      el.setAttribute("role", "heading");
      el.setAttribute("aria-level", HEADINGS[i].level);
      n++;
    }
    return n;
  }

  /* REMOVED: role="main" on #mainview, and role="dialog"/aria-modal on the
     four menu containers. Both were added to satisfy criteria rather than to
     help anyone, and the dialog roles were actively dangerous.

     WHY NO MAIN LANDMARK
     A landmark earns its place by PARTITIONING a page -- main alongside nav,
     banner, complementary, so D cycles between meaningfully different areas.
     One landmark wrapping every piece of content gives D a single
     destination equivalent to "top of content", which the user already has.
     It ticks 2.4.1 and delivers nothing.

     WHY NO DIALOG ROLES
     Two reasons, the second decisive:

     1. role="dialog" pays off through focus management -- focus moves in on
        open, is trapped while open, returns to the invoker on close. This
        mod deliberately does none of that (see the ACTIVATION note above:
        no key handling, because browse mode drives activation itself). The
        role would announce a contract the implementation does not honour.

     2. aria-modal="true" asserts that everything OUTSIDE the container is
        inert. But #m-menu (line 440), #backinfo (484), #instructions (539)
        and #m-vidops (596) all sit OUTSIDE #mainview (284). So the assertion
        covers the entire game area. A screen reader honouring it strictly
        would drop all gameplay content from the tree the moment the menu
        opened -- the same class of bug as muting real menu content, and
        strictly worse than the flat structure it replaced.

     The HEADINGS are kept. They are what actually made the menu navigable:
     H now jumps between three sections that were previously flat text. */

  /* Mark layout tables as presentational so they are not announced as data. */
  function demoteTables(root) {
    if (!root || !root.getElementsByTagName) return 0;
    var n = 0;
    var tags = ["table", "tr", "td", "tbody"];
    for (var t = 0; t < tags.length; t++) {
      var els = root.getElementsByTagName(tags[t]);
      for (var i = 0; i < els.length; i++) {
        els[i].setAttribute("role", "presentation");
        n++;
      }
    }
    return n;
  }

  /* =======================================================================
     1. THE FOUR LOCATION EXITS  (+ investigate)

     #A_click .. #D_click sit over #opt_A .. #opt_D. The option text is
     rewritten by the game on every arrival, so these labels cannot be set
     once -- they are re-synced whenever the text changes (see the observer
     and the words() hook below).

     An exit with no text is an empty slot: the game's own moveloc() does
     nothing for it. Such a control is hidden rather than left announcing a
     stale name from the previous location.
     ======================================================================= */
  var EXITS = [
    { click: "A_click", text: "opt_A", box: "op_A" },
    { click: "B_click", text: "opt_B", box: "op_B" },
    { click: "C_click", text: "opt_C", box: "op_C" },
    { click: "D_click", text: "opt_D", box: "op_D" }
  ];

  function syncExits() {
    var named = 0;
    for (var i = 0; i < EXITS.length; i++) {
      var a = $(EXITS[i].click), t = $(EXITS[i].text);
      if (!a) continue;
      var words = t ? clean(t.innerHTML) : "";
      if (words) {
        // Reference the game's own text rather than copying it. The words
        // keep their structure and cannot drift out of sync.
        // movebut() -> moveloc(): changes location, so this is a link.
        linkTo(a, t, roleFor(a));

        /* Do NOT un-hide while a takeover screen is up.
           syncExits() runs on every words("opt_X") write, and resuming from
           the menu repaints the exits ~1s later (see the arrival repaint in
           the takeover section). Clearing aria-hidden unconditionally here
           undid muteCoveredGameplay()'s mute on #paths -- and because
           aria-hidden on a CHILD overrides the parent's, the exit text and
           its links came back while the menu was still covering them.
           That is the "Go ahead to the pub... on resume" report. */
        if (!anyTakeoverShowing()) {
          a.removeAttribute("aria-hidden");
          a.removeAttribute("tabindex");
        }
        named++;
      } else {
        // Empty slot -- no exit this way. moveloc() no-ops on it, so keep it
        // out of the tab order rather than announcing a stale destination.
        a.setAttribute("aria-hidden", "true");
        a.setAttribute("tabindex", "-1");
        a.removeAttribute("aria-label");
        a.removeAttribute("aria-labelledby");
      }
    }
    return named;
  }

  /* =======================================================================
     2. THE MAP  --  ten pins on one linear route

     #mpin1 .. #mpin10 call mapmove(1..10). The pins are ordered west to
     east along a single road; mapins[] holds only pixel coordinates and
     mapMoves[] holds scene ids ("WOODS LANE < NORTH"), so neither carries a
     readable name. These ten strings are the only authored text in the mod.
     ======================================================================= */
  var MAP_STOPS = [
    "West End, Lisa’s house",
    "Farm exterior",
    "West Street",
    "The Village Centre",
    "North Lane",
    "Woods Lane",
    "The Woods",
    "Junction A",
    "Junction B",
    "Atlas building exterior"
  ];

  function labelMap() {
    var n = 0;
    for (var i = 1; i <= MAP_STOPS.length; i++) {
      var pin = $("mpin" + i);
      if (!pin) continue;
      var name = MAP_STOPS[i - 1] + ", stop " + i + " of " + MAP_STOPS.length;
      // The <a> is focusable; the div inside carries mapmove(). Name the
      // focusable element, but wire Enter/Space to the element that acts.
      var a = pin.parentNode && pin.parentNode.tagName === "A" ? pin.parentNode : pin;
      // mapmove() lives on the inner div, so that div must be the control.
      // mapmove() travels to another location: navigation, so link.
      var ctl = makeControl(a, "Travel to " + name, roleFor(a));
      if (ctl) n++;

      /* Gate the pin on ITSELF, with an extra condition applied in
         refreshGates(): the game's own `momap` flag (see mapIsOpen).

         Watching #mousemap instead was tried and REVERTED -- it inverted the
         bug, making the pins unreachable with the map open in game.

         Why the extra flag is needed: #mousemap ships with opacity:0.1 in
         CSS -- not 0, and not display:none -- and NOTHING in cc.js hides it
         at startup. Every quickoff/turnoff("mousemap") is inside openwood()
         or guarded by `1===momap`, i.e. only once the menu or the map has
         actually been used. So from DOMContentLoaded until the player first
         opens the menu, the panel is technically rendered at opacity 0.1 and
         our offscreen() threshold (<= 0.01) correctly calls that "visible" --
         which made all ten pins reachable on the title screen.

         Raising the threshold is NOT the fix: #iconBook and the icon strip
         sit at 0.6 and #menuDark at 0.7 as deliberate styling, and would be
         wrongly muted. */
      gate(ctl);
    }
    return n;
  }

  /* =======================================================================
     3. STATIC CONTROLS

     Every remaining nameless link, labelled from the game's own wording
     where it exists. The four icon buttons reuse the text the game already
     shows as tooltips (#showtip1..5), so the spoken name matches what a
     sighted player sees.

     Keyed by the id of the element INSIDE the <a> (the game puts the id on
     the inner div, not the link), except where the link itself has the id.
     ======================================================================= */
  var INNER_LABELS = {
    // icon strip -- names taken from #showtip1..5
    // NOTE: #iconMouse is commented out in index.html and does not exist at
    // runtime. Do not add it back without checking the markup first.
    iconBook:  ["Show inventory", "button"],
    iconMap:   ["Show map", "button"],
    iconHelp:  ["Show tips", "button"],
    iconHome:  ["Return to the main menu", "button"],

    // close / dismiss buttons
    "m-map-x":  ["Close map", "button"],
    "m-inv-x":  ["Close inventory", "button"],
    "m-help-x": ["Close tips", "button"],
    "m-gen-x":  ["Close menu", "button"],
    "m-clue-x": ["Close clue", "button"],
    "m-info-x": ["Close case background information", "button"],
    "m-inst-x": ["Close instructions", "button"],
    "m-vid-x":  ["Close audio and video options", "button"],

    // paging arrows
    backAL:  ["Previous page, case background", "button"],
    backAR:  ["Next page, case background", "button"],
    instAL:  ["Previous page, instructions", "button"],
    instAR:  ["Next page, instructions", "button"]
  };

  /* =======================================================================
     THE EXIT-INTERVIEW CONTROLS

     Three links that sit between #clickbox and the icon strip:

       <a onclick="exitint(0)"><div id="m-exitint"><br><br>Exit</div></a>
       <a onclick="exitint(1)"><div id="m-exitsimon">Visit<br>Simon</div></a>
       <a onclick="exitint(1)"><div id="m-exitemma">Visit<br>Emma</div></a>

     They only mean anything during an interview -- they end it, or switch to
     another suspect -- but nothing hides them, so they were reachable from
     the main menu onward. markButtons() gave them role="button" while their
     name was left to inner text that starts with <br><br>, so they announced
     as three nameless buttons in exactly this position.

     Named explicitly, and gated so they are only reachable when actually on
     screen. "Visit Simon"/"Visit Emma" are shown one at a time depending on
     who is available, which the gate handles by reading what is rendered. */
  var EXIT_LABELS = {
    "m-exitint":   "Exit the interview",
    "m-exitsimon": "Leave and visit Simon",
    "m-exitemma":  "Leave and visit Emma"
  };

  function labelExitInterview() {
    var n = 0;
    for (var id in EXIT_LABELS) {
      if (!EXIT_LABELS.hasOwnProperty(id)) continue;
      var inner = $(id);
      if (!inner) { log("exit control not found: " + id); continue; }
      var a = inner.parentNode && inner.parentNode.tagName === "A" ? inner.parentNode : inner;
      // exitint() leaves the interview for another place: link.
      var ctl = makeControl(a, EXIT_LABELS[id], roleFor(a));

      /* The onclick is on the <a>, so the control IS the <a> -- but the game
         hides these with quickoff("m-exitint")/turnoff("m-exitint"), which
         target the INNER div by id. Watching only the control would miss
         that entirely, which is why these stayed reachable on the main menu.
         Gate against the inner div's rendered state instead. */
      gateVia(ctl, inner);
      n++;
    }
    return n;
  }

  /* =======================================================================
     THE THREE INVENTORY ICONS  (Try using this / Ask about this / Replay)

     Reported live: with an item open, "Try using this" reads correctly but
     there are also TWO UNLABELLED BUTTONS, and activating one produced a
     game error.

     WHAT IS ACTUALLY WRONG -- it is not the labelling.
     All three are structurally identical in index.html:411-413, all three
     carry real text, and markButtons() names all three at boot. The defect
     is REACHABILITY: they are offered when they cannot work.

       #m-useIcon  don()/doff()      -- shown when an item can be used
       #m-askIcon  texon()/texoff()  -- shown only when askabled === 1
       #m-repIcon  texon()/texoff()  -- shown only on the reply path

     Their handlers are MUTUALLY EXCLUSIVE and both can be dead:
       mouseask() { 1===askabled && 0===mblock && ask() }
       mouserep() { 0===askabled && 1===canask && 0===mblock && (...) }
     So at most one is live at any moment, and often neither is. Activating
     the wrong one runs a handler whose guard fails -- which is the error the
     player hit.

     WHY THEY STAYED REACHABLE
     None of the three has display:none in its CSS: all three are visible at
     boot, stacked at the same position (left:28%, top:77%). The game hides
     two at runtime with texoff(), which sets display:none on the INNER DIV
     by id. But the control is the <a> WRAPPER, and those wrappers have no
     id, so nothing the game does touches them and no boot-time pass gated
     them. adoptLinks() also marks each link _a11ySeen and never revisits it,
     so a one-time pass could not have caught the change either.

     Same shape as the exit controls above (see gateVia at the interview
     exits): gate the wrapper against the INNER div's rendered state, so each
     icon is reachable exactly when the game is showing it -- and therefore
     exactly when its handler's guard will pass.

     ⚠ #m-useIcon IS DELIBERATELY EXCLUDED. Gating it hid "Try using this"
     in the normal inventory, because its display state is NOT a valid
     signal there. The game's only don() for it is guarded:

         1===itemList[12*curq+7] ? doff("m-useIcon")
                                 : 0===invon && don("m-useIcon")

     -- it is re-shown ONLY when invon===0. repon() (the interview reply
     path) also opens with doff("m-useIcon") and never restores it. So while
     the player is IN the inventory (invon===1) the div can sit at
     display:none even though the control is live and on screen, and reading
     that state hides a working control.

     The ask/replay pair are safe to gate because the game drives them
     explicitly with texon()/texoff() on the very same paths that set
     askabled/canask -- their display state and their handler guards move
     together. #m-useIcon's does not. */
  var ICON_CONTROLS = ["m-askIcon", "m-repIcon"];

  function gateInventoryIcons() {
    var n = 0;
    for (var i = 0; i < ICON_CONTROLS.length; i++) {
      var inner = $(ICON_CONTROLS[i]);
      if (!inner) { log("inventory icon not found: " + ICON_CONTROLS[i]); continue; }
      var a = (inner.parentNode && inner.parentNode.tagName === "A")
                ? inner.parentNode : inner;
      gateVia(a, inner);
      n++;
    }
    return n;
  }

  /* Controls whose id is on the <a> itself. */
  /* investigate() searches the current location and may or may not turn up
     something; it does not take the player elsewhere, so it is a button. */
  var DIRECT_LABELS = {
    inv_click: ["Investigate this location", "button"]
  };

  /* inv_click sits in #clickbox alongside the four exits and is present from
     boot, so on the main menu and during the prologue it offers to
     "investigate" a location the player is not in. It follows the same rule
     as the exits: reachable only while the location UI is actually up. */
  function gateInvestigate() {
    var inv = $("inv_click");
    if (!inv) return;
    gate(inv);
  }

  function labelStatic() {
    var n = 0, missing = [];

    for (var id in INNER_LABELS) {
      if (!INNER_LABELS.hasOwnProperty(id)) continue;
      var inner = $(id);
      if (!inner) { missing.push(id); continue; }
      var a = inner.parentNode && inner.parentNode.tagName === "A" ? inner.parentNode : inner;
      // Name the element that owns the handler, so browse-mode activation
      // reaches the game's own code.
      // Role from the handler's behaviour, not from a guess in the table:
      // iconHome calls gowood() and returns to the main menu, so it is a
      // link, while iconMap toggles an overlay in place and is a button.
      var ctl = makeControl(a, INNER_LABELS[id][0], roleFor(a));
      if (ctl) n++;
      gate(ctl);        // follows the game's own show/hide
    }

    for (var d in DIRECT_LABELS) {
      if (!DIRECT_LABELS.hasOwnProperty(d)) continue;
      var el = $(d);
      if (!el) { missing.push(d); continue; }
      if (label(el, DIRECT_LABELS[d][0], roleFor(el))) n++;
    }

    if (missing.length) log("NOT FOUND (not labelled): " + missing.join(", "));
    return n;
  }

  /* =======================================================================
     ROLE: LINK vs BUTTON

     WCAG draws this line by BEHAVIOUR, not by markup or by whether an
     element happens to contain text:

       link   -- takes the player somewhere else (a different location,
                 a different scene, a different suspect)
       button -- performs an action in place (open a panel, toggle a
                 setting, page through text, close an overlay)

     Every handler in the game classified by what it actually does. Anything
     not listed defaults to button, because an unrecognised onclick is far
     more likely to act than to navigate, and announcing an action as a link
     promises a change of place that never happens.

     Verified against cc.js:
       movebut -> moveloc()      changes location            = link
       mapmove -> moveloc()      travels to a map stop       = link
       exitint                   leaves the interview        = link
       gomen                     enters a menu screen        = link
       gowood                    returns to the main menu    = link
       playclue / scenerep       plays a different scene     = link
       gomap / mouseinv          toggle an overlay in place  = button
       showinfo / showinst       page through text in place  = button
       subtog / fulltog          toggle a setting            = button
       turnoff / killclue        dismiss an overlay          = button
     ======================================================================= */
  var NAVIGATES = {
    movebut: 1, mapmove: 1, exitint: 1, gomen: 1, gowood: 1,
    playclue: 1, scenerep: 1, startgame: 1, mshowreps: 1
  };

  /* Work out the role from the handler an element actually carries. */
  function roleFor(node) {
    var src = "";
    if (node) {
      src = node.getAttribute && node.getAttribute("onclick") || "";
      if (!src) {
        var h = handler(node);
        if (h && h.getAttribute) src = h.getAttribute("onclick") || "";
      }
    }
    var fn = String(src).replace(/^\s*/, "").replace(/\s*\(.*$/, "").trim();
    return NAVIGATES[fn] ? "link" : "button";
  }

  /* =======================================================================
     4. LINKS THAT ALREADY READ CORRECTLY

     24 links carry real text ("Watch Prologue", "Save Game 1", "Visit
     Simon"). Those names are good and are left alone -- relabelling them
     would only risk contradicting what is on screen. They are given
     role="button" only where they act on the game rather than navigate.
     ======================================================================= */
  function markButtons() {
    var links = document.getElementsByTagName("a");
    var n = 0;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute("role")) continue;          // already handled above
      var txt = clean(a.innerHTML);
      if (!txt) continue;                            // nameless ones handled above
      // Role follows what the handler DOES, not whether the element has
      // text. href="#" means the <a> never navigates on its own, so the
      // announced role must come from the behaviour behind it.
      if (a.getAttribute("onclick") || a.onclick) {
        a.setAttribute("role", roleFor(a));
        // These controls hold their text inside single-cell layout tables
        // ("Try using this" beside an icon). Demote the table so the name
        // is not prefixed with "table, row 1, column 1".
        demoteTables(a);
        n++;
      }
    }
    return n;
  }

  /* =======================================================================
     KEEPING HIDDEN CONTROLS OUT OF THE WAY

     The icon strip (#icons) is never hidden with the game's usual helpers --
     iconsOn()/iconsOff() drive it directly through the bare `icons` global,
     setting opacity first and display:none only 500ms later. During that
     window, and whenever the strip is faded out, the four buttons stay in
     the accessibility tree and the tab order even though they are not on
     screen. That is why they appeared permanently present.

     Rather than guess at the game's state, read what is actually rendered:
     an element that is transparent or display:none is not available, so it
     leaves the tab order until it comes back. */
  function offscreen(node) {
    if (!node) return true;
    var cs = window.getComputedStyle ? window.getComputedStyle(node) : null;
    if (!cs) return false;
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    var o = parseFloat(cs.opacity);
    return !isNaN(o) && o <= 0.01;
  }

  /* An element is unavailable if it, or anything above it, is not rendered. */
  function hiddenInTree(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentNode) {
      if (offscreen(n)) return true;
    }
    return false;
  }

  /* =======================================================================
     PANELS THAT LEAK THEIR TEXT

     Some panels are hidden with `opacity:0` alone. Opacity is a paint
     property, so the text inside stays in the accessibility tree and is
     read even though nothing is on screen -- which is why the main menu
     announced "Contradictions will appear here... ...and here." from the
     interview UI.

     Only panels carrying STATIC placeholder text need this. Most of the
     game's screens are filled in at runtime and are empty when hidden, so a
     blanket sweep would be noise; these are the ones that ship with words
     already in them.

     Gated on what is actually rendered, so they return the moment the game
     shows them. `visibility` is not used: it would fight the game's own
     opacity transitions. aria-hidden alone removes the text from the tree
     while leaving the fade untouched.
     ======================================================================= */
  /* NOTE: #m-helpme is NOT listed here. Its text ("Your current game saves
     automatically as you play.") reads like stray in-game guidance, but it
     lives inside #m-menu and is genuine main-menu content. Muting it would
     have removed real information from the screen the player is on.

     The test for membership is the DOM: which container is it inside? Not
     when the text was written -- the game builds most of its strings during
     initial load, so "written at runtime" says nothing about which screen
     owns them. */
  var LEAKY_PANELS = [
    "botbar",       // holds the contradiction box (conAt/conBt placeholders)
    "recall",
    "credbox",
    "intinfo",
    "exitop",
    /* #mapinfo carries static instruction text ("Click a pin or move left
       and right with the controller...") and lives inside #mousemap, which
       ships at opacity:0.1 and is not hidden by cc.js until the player first
       opens the menu. The PINS are gated separately (see mapIsOpen), but
       this text is not a pin, so nothing covered it -- which is why the map
       still read out at startup after the pins were fixed.

       hidePanelsWhenOffscreen() gates on rendered state, and 0.1 is above
       our 0.01 threshold, so add the panel itself rather than relying on
       that: mapinfo is only ever wanted while the map is genuinely open. */
    "mapinfo"
  ];

  function hidePanelsWhenOffscreen() {
    var n = 0;
    for (var i = 0; i < LEAKY_PANELS.length; i++) {
      var el = $(LEAKY_PANELS[i]);
      if (!el) continue;
      /* Anything inside #mousemap needs the same extra condition as the
         pins: the panel renders at opacity:0.1 until the game first hides
         it, so the DOM check alone reports its contents visible on the
         title screen. */
      if (hiddenInTree(el) || (insideMapPanel(el) && !mapIsOpen())) {
        if (el.getAttribute("aria-hidden") !== "true") {
          el.setAttribute("aria-hidden", "true");
        }
        n++;
      } else {
        el.removeAttribute("aria-hidden");
      }
    }
    return n;
  }

  /* =======================================================================
     GAMEPLAY TEXT THAT SURVIVES A TAKEOVER SCREEN

     Reported live: after loading a game, with the main menu on screen, the
     following was still being read --

         Go ahead to the pub / Go left down West Street /
         Go right up North Lane / The Village Centre /
         Friday / after 5pm / Game loaded. It's gone 5pm.

     This is a GAME defect, not a mod one, and it is a RACE -- not stale
     text left lying around.

     The load path hides the gameplay layer first (topoff("paths")), then
     queues the normal location-arrival repaint on a ONE SECOND timer:

         setTimeout(function(){
           words("place", newname);            // "The Village Centre"
           topoff("op_A".."op_D");             // hide all four exits
           texoff("A_click".."D_click");
           0!==locList[options+9] && (topon("op_A"), texon("A_click"), ...)
           ...                                 // re-show the valid exits
         }, 1E3);

     So one second after the load, the game REPAINTS the arrival screen --
     location name, time, and whichever exits exist here. It calls topon()
     on the INDIVIDUAL options, not on #paths, and never checks whether a
     menu has opened in the meantime. The text is therefore freshly written
     onto a screen the menu is covering.

     The sixth line, "Game loaded...", is #newstext inside #newsbox: on menu
     open the game moves only its .top, never zeroing opacity, and the load
     path writes that text via timeup() after the hide.

     Note the menu-open sequence hides five panels
     (conicons/mousemap/m-invbox/m-sumbar/mousehelp) and never touches
     #paths either -- so nothing re-hides what the timer paints.

     ⚠ KNOWN EDGE: if the 1s repaint lands while the menu is CLOSING, the
     unmute may run before the paint. If those lines ever flash back on
     leaving the menu, this gate needs to re-run on a short delay after a
     takeover closes, not only on the observer tick.

     WHY THE EXISTING MACHINERY MISSES IT
     hidePanelsWhenOffscreen() and refreshGates() both ask "is this element
     hidden?" and mute it if so. Here the answer is legitimately NO: the game
     never hid these. The question that matters is the inverse --

         is a TAKEOVER screen currently covering them?

     LEAKY_PANELS also assumes runtime-filled screens are empty when hidden
     (see its note). The load-game case is the counterexample: filled, and
     left filled.

     WHY GATE ON #m-menu's OWN RENDERED STATE
     Not on the menon/mmu globals: menon alone has at least 8 values
     (gomen() maps 2..10 to different sub-screens) and mmu is set alongside
     other flags, so reading them means tracking a state machine that the
     game can change. The menu's own computed style is the ground truth, and
     boot does quickoff("m-menu") -> display:none + opacity:0, so "hidden"
     is unambiguous at startup too.

     ⚠ turnon() sets display:initial IMMEDIATELY but opacity=1 inside a
     setTimeout, so there is a frame where the menu is displayed at opacity
     0. hiddenInTree() reads opacity, so it correctly reports "still hidden"
     during that window and the gate simply applies a beat later, when the
     menu is really visible. No flicker, and never a false mute.
     ======================================================================= */
  var TAKEOVERS = ["m-menu", "backinfo", "instructions", "m-vidops"];

  /* Gameplay containers that the takeover screens fail to hide. */
  var COVERED_BY_TAKEOVER = ["paths", "newsbox"];

  function anyTakeoverShowing() {
    for (var i = 0; i < TAKEOVERS.length; i++) {
      var t = $(TAKEOVERS[i]);
      if (t && !hiddenInTree(t)) return true;
    }
    return false;
  }

  /* Mute gameplay text while a takeover screen covers it, and -- just as
     importantly -- unmute it the moment the takeover closes. A one-way mute
     would silence the exits permanently after the first visit to the menu. */
  function muteCoveredGameplay() {
    var covering = anyTakeoverShowing();
    var n = 0;
    for (var i = 0; i < COVERED_BY_TAKEOVER.length; i++) {
      var el = $(COVERED_BY_TAKEOVER[i]);
      if (!el) continue;
      if (covering) {
        if (el.getAttribute("aria-hidden") !== "true") {
          el.setAttribute("aria-hidden", "true");
        }
        n++;
      } else if (el.getAttribute("aria-hidden") === "true") {
        /* Only clear what THIS pass set. If the element is genuinely hidden
           on its own account, refreshGates()/hidePanelsWhenOffscreen() own
           that decision and will re-apply it on the same tick. */
        el.removeAttribute("aria-hidden");
      }
    }
    return n;
  }

  /* =======================================================================
     ANNOUNCING TEXT THAT APPEARS ELSEWHERE  (live regions)

     Reported: activating a control makes text appear somewhere else on the
     page, and nothing tells the player it happened.

     FOCUS ROUTING WAS TRIED FIRST AND FAILED -- do not rebuild it.
     A programmatic .focus() on a plain div does not reliably move NVDA's
     review position: in browse mode the screen reader keeps its own virtual
     cursor over a document snapshot and decides where it goes. The DOM focus
     changed, focus() returned cleanly, and the reading position did not
     move. Same architecture as the ACTIVATION note above -- the screen
     reader owns the cursor, not the page.

     A live region sidesteps that entirely: the text is ANNOUNCED where it
     appears and the cursor is never touched. Nothing is stolen, so there is
     also no risk of re-pinning the cursor on the observer's constant ticks.

     WHICH REGIONS, AND WHY THESE
     Measured, not guessed. A words() audit over a real play session showed
     #newstext is the game's response ticker: activating "Try using this"
     put "There's no use for Kate's lost driving licence here, sorry." there
     358ms later, with the player's position unchanged and nothing to tell
     them. news() has ~20 call sites and carries both direct answers
     ("There's nothing to find here.", "Jenks has already used ...") and
     ambient notices ("Controller disconnected", "Game Saved").

     polite, NOT assertive: these are informational. assertive interrupts
     whatever is being spoken, which for a ticker that also carries ambient
     notices would cut across the player mid-sentence.

     ⚠ aria-live must be on a container that EXISTS AND STAYS PUT. Setting
     it on an element the game replaces, or adding it at the same moment the
     text lands, means the region is new to the screen reader and nothing is
     announced. All of these are static containers in index.html that cc.js
     writes INTO via words(), so the region is established at boot and only
     its contents change -- which is exactly what a live region reacts to.

     ⚠ atomic=false: announce only what changed, not the whole panel. The
     inventory list would otherwise be re-read in full on every update. */
  var LIVE_REGIONS = [
    /* ⚠ #newstext lives inside #newsbox, which muteCoveredGameplay() marks
       aria-hidden while a takeover screen is open. aria-hidden INHERITS, so
       the ticker is silent behind the menu and announces normally otherwise.
       That is intended, not a bug -- do not "fix" it by removing the gate. */
    { id: "newstext",   politeness: "polite" },  // the response ticker
    { id: "m-detext",   politeness: "polite" },  // item detail text
    { id: "m-invlist",  politeness: "polite" },  // inventory contents
    { id: "m-sumdets",  politeness: "polite" },  // summary detail
    { id: "m-clue",     politeness: "polite" }   // clue / investigation result
  ];

  function markLiveRegions() {
    var n = 0;
    for (var i = 0; i < LIVE_REGIONS.length; i++) {
      var spec = LIVE_REGIONS[i];
      var el = $(spec.id);
      if (!el) { log("live region not found: " + spec.id); continue; }
      el.setAttribute("aria-live", spec.politeness);
      el.setAttribute("aria-atomic", "false");
      n++;
    }
    return n;
  }

  /* Controls whose availability follows the game's own show/hide. */
  /* Each entry is { node, watch }: `node` is the control whose reachability
     we manage, `watch` is the element whose rendered state decides it. They
     are usually the same, but the game sometimes hides a wrapper while the
     handler sits on the child, or hides the child by id while the control is
     the parent -- so the two must be separable. */
  var GATED = [];
  function gate(node) { gateVia(node, node); }
  function gateVia(node, watch) {
    if (!node) return;
    for (var i = 0; i < GATED.length; i++) if (GATED[i].node === node) return;
    GATED.push({ node: node, watch: watch || node });
  }

  /* The map pins need one condition the DOM cannot supply.

     #mousemap is never hidden at startup: it ships at opacity:0.1 and every
     hide in cc.js is inside openwood() or guarded by `1===momap`. So before
     the player first opens the menu, the panel is genuinely rendered (0.1 is
     above our 0.01 threshold) and the pins read as reachable on the title
     screen -- the "pins flash at load" report.

     The game's own momap flag says whether the map is open, which is exactly
     the question. Read it defensively: if cc.js has not defined it yet, fall
     back to the DOM check alone rather than hiding a working control. */
  var momapWarned = false;
  function mapIsOpen() {
    if (typeof window.momap === "undefined") {
      /* Say so once. Silently returning "open" would quietly reinstate the
         startup flash and look like the fix simply stopped working.
         momap is declared top-level in cc.js alongside minvon/mmu/mohelp,
         so this should not happen -- if it does, cc.js changed. */
      if (!momapWarned) {
        momapWarned = true;
        log("WARNING: window.momap undefined -- map pins fall back to the " +
            "DOM check alone, and may be reachable on the title screen");
      }
      return true;
    }
    return window.momap === 1;
  }

  /* Anything INSIDE #mousemap, not just the pins.

     Naming ids one at a time kept missing things: the pins were gated, then
     #mapinfo still read out, then #m-map-x ("Close map") still read out.
     The panel's whole subtree shares one condition -- is the map open? --
     so ask that question by CONTAINMENT rather than by maintaining a list
     that the next element added to the panel would silently escape. */
  var mapPanelEl = null;
  function insideMapPanel(node) {
    if (!mapPanelEl) mapPanelEl = $("mousemap");
    if (!mapPanelEl || !node) return false;
    for (var n = node; n && n.nodeType === 1; n = n.parentNode) {
      if (n === mapPanelEl) return true;
    }
    return false;
  }

  function refreshGates() {
    var hidden = 0;
    for (var i = 0; i < GATED.length; i++) {
      var n = GATED[i].node;
      if (hiddenInTree(GATED[i].watch) || (insideMapPanel(n) && !mapIsOpen())) {
        n.setAttribute("aria-hidden", "true");
        n.setAttribute("tabindex", "-1");
        hidden++;
      } else {
        n.removeAttribute("aria-hidden");
        // Restore the element's own tabindex. Removing it outright would
        // strip the "0" that makes a <div> control focusable at all, so a
        // control that was hidden once would never be reachable again.
        if (n._a11yTabindex) n.setAttribute("tabindex", n._a11yTabindex);
        else n.removeAttribute("tabindex");
      }
    }
    return hidden;
  }

  /* =======================================================================
     RUNTIME-GENERATED LINKS

     cc.js writes 10 more <a href='#' onclick='...'> into the page as the
     game runs (clue replays, reply lists, the cheat toggle). They never
     exist at boot, so a one-off pass cannot reach them: they are exactly the
     nameless "index" links that appear mid-game.

     Each is named from its own text where it has any, and pulled out of the
     tab order where it has none, so a nameless control is never focusable.
     ======================================================================= */
  function adoptLinks() {
    var links = document.getElementsByTagName("a");
    var named = 0, silenced = 0;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a._a11ySeen) continue;
      // Anything already given a name by the passes above is left alone.
      if (a.getAttribute("aria-label") || a.getAttribute("aria-labelledby")) {
        a._a11ySeen = true;
        continue;
      }
      // A wrapper we already collapsed around a real control. Marking it
      // aria-hidden would hide the working control INSIDE it, since
      // aria-hidden inherits to descendants.
      if (a.getAttribute("role") === "presentation") {
        a._a11ySeen = true;
        continue;
      }

      var txt = clean(a.innerHTML);
      if (txt) {
        // Role from behaviour, same rule as everywhere else: a control that
        // takes the player elsewhere is a link, one that acts in place is a
        // button. Never from whether it happens to contain text.
        if (a.getAttribute("onclick") || a.onclick) a.setAttribute("role", roleFor(a));
        demoteTables(a);
        named++;
      } else if (handler(a) && handler(a) !== a) {
        // Nameless, but something inside it carries a handler -- that inner
        // element is the real control. Collapse the wrapper rather than
        // hiding the pair.
        // Drop the href: role="presentation" alone is ignored on a
        // focusable element, so the wrapper would keep announcing as a
        // nameless link ("index").
        a.removeAttribute("href");
        a.setAttribute("role", "presentation");
        a.setAttribute("tabindex", "-1");
        silenced++;
      } else {
        // Genuinely empty and inert: nameless. Remove the href so it is not
        // focusable, and hide it outright.
        a.removeAttribute("href");
        a.setAttribute("aria-hidden", "true");
        a.setAttribute("tabindex", "-1");
        silenced++;
      }
      a._a11ySeen = true;
    }
    return { named: named, silenced: silenced };
  }

  /* Every remaining <table> in the page is layout scaffolding: there is not
     one <th>, <caption>, <thead> or <tbody> in the whole build, and the
     pattern is always <table 100%x100%><tr><td> around a single centred
     string. Announcing these as data tables would put a grid between the
     player and every menu item. */
  function demoteAllTables() {
    return demoteTables(document.body || document);
  }

  /* =======================================================================
     5. KEEPING THE EXIT LABELS FRESH

     The game rewrites option text through words(id, html). Wrapping it lets
     us re-sync the moment the text changes, with no polling. A MutationObserver
     is also attached as a backstop for any path that writes innerHTML
     directly, since a stale label is worse than no label -- it would send the
     player somewhere they did not choose.
     ======================================================================= */
  function hookWords() {
    if (typeof window.words !== "function") {
      log("WARNING: words() not found -- exit labels will rely on the observer only");
      return false;
    }
    var orig = window.words;
    window.words = function (id, html) {
      var r = orig.apply(this, arguments);
      try {
        if (typeof id === "string" && id.indexOf("opt_") === 0) syncExits();
        // words() writes fresh markup, which often contains a new layout
        // table. Demote it now, or it is announced as a data grid.
        var node = $(id);
        if (node && /<table/i.test(String(html))) demoteTables(node);
      } catch (e) { log("sync error after words(): " + e); }
      return r;
    };
    return true;
  }

  function watchOptions() {
    if (typeof window.MutationObserver !== "function") return false;
    var obs = new MutationObserver(function () { syncExits(); });
    var watched = 0;
    for (var i = 0; i < EXITS.length; i++) {
      var t = $(EXITS[i].text);
      if (t) { obs.observe(t, { childList: true, characterData: true, subtree: true }); watched++; }
    }
    return watched > 0;
  }

  /* ===================================================================== */
  /* Run one pass in isolation. A failure in any single pass must not take
     the rest of the mod down with it -- a partly-labelled game is usable, a
     mod that threw on load is not. */
  function safely(name, fn, fallback) {
    try { return fn(); }
    catch (e) { log("PASS FAILED (" + name + "): " + e); return fallback; }
  }

  function boot() {
    var lang   = safely("lang", setPageLanguage, false);
    var alts   = safely("altText", silenceDecorativeImages, 0);
    var heads  = safely("headings", markHeadings, 0);
    var tables = safely("tables", demoteAllTables, 0);
    var exits  = safely("exits", syncExits, 0);
    var pins   = safely("map", labelMap, 0);
    var stat   = safely("static", labelStatic, 0);
    var av = safely("sliders", fixSliders, { fixed: 0, named: 0 });
    // Before markButtons(), which would otherwise mark these role="button"
    // and leave their name to inner text beginning with <br><br>.
    var exitInt = safely("exitInterview", labelExitInterview, 0);
    safely("investigate", gateInvestigate, null);
    var icons = safely("inventoryIcons", gateInventoryIcons, 0);
    var btns   = safely("buttons", markButtons, 0);
    var hooked = safely("words", hookWords, false);
    var obs    = safely("observer", watchOptions, false);

    var adopted = adoptLinks();
    var gated   = refreshGates();
    var panels  = safely("panels", hidePanelsWhenOffscreen, 0);
    var covered = safely("covered", muteCoveredGameplay, 0);

    var live = safely("liveRegions", markLiveRegions, 0);

    /* Exposed so the refresh can be driven and verified directly, not only
       by waiting on an event. */
    window.a11yRefresh = function () {
      try {
        return {
          links: adoptLinks(),
          hidden: refreshGates(),
          panels: hidePanelsWhenOffscreen(),
          covered: muteCoveredGameplay()
        };
      }
      catch (e) { log("refresh error: " + e); return null; }
    };

    /* WATCHING FOR CHANGE -- event-driven, not polled.

       The game shows and hides controls constantly and offers no event of
       its own, so something has to notice. This used to be a 400ms
       setInterval. A MutationObserver does the same job natively: the
       browser already knows when the DOM changed, so asking it beats asking
       repeatedly whether anything happened.

       Two kinds of change matter:
         - `style` attribute writes -- every visibility helper in cc.js sets
           style.opacity or style.display, so this covers every show/hide
         - added nodes -- cc.js writes ~10 <a href='#' onclick=…> into the
           page mid-game via innerHTML, which no boot-time pass can reach

       Coalesced on a microtask so a burst of writes (turnon() touches
       several elements in a row) triggers one refresh, not several. */
    var pending = false;
    function scheduleRefresh() {
      if (pending) return;
      pending = true;
      var run = function () { pending = false; window.a11yRefresh(); };
      if (typeof Promise === "function") Promise.resolve().then(run);
      else setTimeout(run, 0);
    }

    var watching = false;
    if (typeof MutationObserver === "function" && document.body) {
      try {
        new MutationObserver(scheduleRefresh).observe(document.body, {
          subtree: true,
          childList: true,                 // links added at runtime
          attributes: true,
          attributeFilter: ["style"]       // every show/hide goes through style
        });
        watching = true;
      } catch (e) {
        log("observer failed: " + e);
      }
    }

    /* SAFETY NET -- runs even when the observer attached fine.

       MEASURED, not theorised: with the map open, all ten pins sat at
       aria-hidden=true / tabindex=-1 while #mousemap and every ancestor
       reported visible. A single a11yRefresh() flipped mpin1 to
       aria-hidden=no / tabindex=0 and the map became usable. So the gate's
       DECISION is right; the refresh simply was not running at the moment
       it mattered.

       The observer watches style attributes and turnon() writes style, so
       in principle it should fire -- modelling the sequence says it should.
       It demonstrably does not, and four attempts to explain why from
       source were all wrong. Rather than ship another theory, run a slow
       poll alongside the observer: the observer keeps the common case
       instant, and this guarantees a stale gate self-corrects within a
       second even when the observer misses an edge.

       1s, not 400ms: refreshGates() walks ~32 controls, and this is a
       backstop rather than the primary path. Cheap enough to leave on. */
    if (typeof setInterval === "function") {
      setInterval(window.a11yRefresh, 1000);
    }

    if (!watching) {
      log("WARNING: no MutationObserver -- relying on the 1s poll alone");
      if (typeof setInterval !== "function") {
        log("WARNING: no timer either -- refresh must be driven manually");
      }
    }

    log("exit-interview controls labelled: " + exitInt + "/3");
    log("A/V sliders: " + av.fixed + "/2 step-corrected, " + av.named + "/2 named");
    log("layout table parts demoted: " + tables);
    log("runtime links: " + adopted.named + " named, " + adopted.silenced + " silenced");
    /* Report the value actually on the element, never a hardcoded string --
       a log that cannot disagree with reality is not evidence. */
    log("page language: " +
        (document.documentElement.getAttribute("lang") || "NOT SET") +
        (lang ? " (set by mod)" : " (pre-existing or failed)"));
    log("decorative images given alt=\"\": " + alts + "/4");
    log("headings marked: " + heads + "/" + HEADINGS.length);
    log("controls hidden while off screen: " + gated + "/" + GATED.length);
    log("leaky panels muted: " + panels + "/" + LEAKY_PANELS.length);
    log("live regions marked: " + live + "/" + LIVE_REGIONS.length);
    log("inventory icons gated to their inner div: " + icons + "/" +
        ICON_CONTROLS.length);
    log("gameplay containers muted behind takeovers: " + covered + "/" +
        COVERED_BY_TAKEOVER.length + " (takeover showing now: " +
        (anyTakeoverShowing() ? "yes" : "no") + ")");
    log("exits labelled now: " + exits + "/4 (varies by location)");
    log("map pins labelled: " + pins + "/" + MAP_STOPS.length);
    log("static controls labelled: " + stat);
    log("existing links marked as buttons: " + btns);
    log("words() hooked: " + hooked + " | option observer: " + obs);

    window.a11yStatus = function () {
      return {
        pageLang: document.documentElement.getAttribute("lang") || "(unset)",
        decorativeImagesSilenced: alts,
        headingsMarked: heads,
        liveRegions: live,
        takeoverShowing: anyTakeoverShowing(),
        gameplayMutedBehindTakeover: covered,
        avSlidersFixed: av.fixed,
        avSlidersNamed: av.named,
        layoutTablePartsDemoted: tables,
        runtimeLinksNamed: adopted.named,
        runtimeLinksSilenced: adopted.silenced,
        gatedControls: GATED.length,
        gatedHiddenNow: refreshGates(),
        exitsLabelledNow: exits,
        mapPins: pins,
        staticControls: stat,
        buttonsMarked: btns,
        wordsHooked: hooked,
        observer: obs,
        log: logged
      };
    };

    /* Report every control a screen reader can currently reach, with the
       name it would announce. Guessing from the markup has been wrong twice;
       this reports what is actually in the tree right now. */
    window.a11yAudit = function () {
      var out = [], all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var n = all[i];
        var role = n.getAttribute("role");
        var tag = n.tagName;
        var isControl = role === "button" || role === "link" ||
                        tag === "A" || tag === "INPUT" || tag === "BUTTON" ||
                        n.getAttribute("tabindex") === "0";
        if (!isControl) continue;
        if (role === "presentation") continue;
        if (hiddenInTree(n)) continue;                 // not reachable now
        if (n.getAttribute("aria-hidden") === "true") continue;

        var name = n.getAttribute("aria-label") || "";
        if (!name) {
          var lb = n.getAttribute("aria-labelledby");
          if (lb && $(lb)) name = clean($(lb).innerHTML);
        }
        if (!name) name = clean(n.innerHTML);
        if (!name && n.value) name = String(n.value);

        out.push({
          tag: tag,
          id: n.id || "(no id)",
          role: role || "(implicit " + tag.toLowerCase() + ")",
          name: name || "*** NO NAME ***",
          onclick: !!(n.getAttribute("onclick") || n.onclick)
        });
      }
      // Put the nameless ones first -- those are the bug.
      out.sort(function (a, b) {
        var an = a.name === "*** NO NAME ***" ? 0 : 1;
        var bn = b.name === "*** NO NAME ***" ? 0 : 1;
        return an - bn;
      });
      if (window.console && console.table) console.table(out);
      var bad = 0;
      for (var j = 0; j < out.length; j++) if (out[j].name === "*** NO NAME ***") bad++;
      log("AUDIT: " + out.length + " reachable controls, " + bad + " with NO NAME");
      return out;
    };

    log("Phase 1 ready. a11yStatus() for counts, a11yAudit() to list every");
    log("reachable control and find the nameless ones.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
