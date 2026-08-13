# Prism — landing page

A single self-contained `index.html`. No build step, no dependencies, no
network requests: all CSS, JS and the favicon are inline, and the hero graphic
is drawn on a canvas rather than loaded.

## Deploy

The app itself keeps its workspace in a local database, so it can't run on
Vercel's serverless filesystem. This folder can — deploy it on its own:

```bash
cd landing
npx vercel deploy --prod
```

Vercel detects a static directory and serves `index.html`. Netlify, Cloudflare
Pages, or GitHub Pages work the same way; point them at `landing/`, with no
build command and `landing` as the publish directory.

## Preview locally

Open `index.html` directly, or serve it:

```bash
npx serve landing
```

## What's in it

- **Hero** — an aimable canvas ray-trace. Drag anywhere on the stage to move the
  angle of incidence; the entry point slides along the prism face and the
  emergent fan tightens or widens with it. Draws one synchronous frame at the
  resting state so it is never blank in a background tab or a static capture,
  then replays the animation on the first frame the reader actually sees.
- **Walkthrough** — six scenes (workspace → ask → propose → review → tickets →
  refusal). Mostly a scripted playback, and the page says so in three places —
  **except step 4, which is genuinely interactive**: click or keyboard-activate
  any diff hunk to accept or reject it, watch the counter and the Apply button
  track your choices. Auto-advance pauses on that step so it can't yank the
  page away mid-decision.
- **Driving it** — prompt chips jump to a scene, `←` / `→` step, `space`
  toggles playback. Keyboard control only binds while the player is on screen
  and focus isn't in a field.
- **Both themes** — **light-first**. Light is the design, so the page commits to
  it with a `data-theme="light"` stamp rather than deferring to the OS, which
  would hide it entirely from a dark-mode machine. Dark is a first-class opt-in
  through the toggle and persists in `localStorage`. Both are defined purely at
  token level, so a surface and its text can never resolve from different
  palettes.
- **Reduced motion** — respected throughout: the beam renders at its resting
  state, the player doesn't auto-advance, and reveal animations are disabled.

## Theme

**Dark is primary.** It lives on the bare `:root`, so it's what renders even if
the `data-theme` stamp is missing or the script never runs — the fallback state
is the intended design, not an accident. Light is the override
(`:root[data-theme="light"]`), reachable from the toggle, and the choice
persists in `localStorage`.

Both are defined purely at token level. No component rule sets a colour inside
a theme block, so a surface and its text can never resolve from different
palettes.

## Design notes

Near-monochrome on paper. `#F7F7F5` ground, `#16181D` ink, and a single muted
**pine `#2F6F62`** accent. Colour is spent in exactly one place — the
refraction — using a desaturated plate spectrum (`--sp-1` … `--sp-5`) that
appears nowhere else in the UI.

Typography is a system sans throughout, carrying its weight through scale,
600 weight, and tight negative tracking (`-0.038em` at h1) rather than a
display face. Monospace is the second voice: eyebrows, line numbers,
annotations, terminal.

Depth comes from hairline borders, not shadows — the stylesheet contains no
`box-shadow` at all. Radius stays at 6px.

Motion is deliberately sparse and slow: one shared easing curve
(`--ease: cubic-bezier(.22,.61,.36,1)`), 0.8s reveals, and a `.rv-group` class
that cascades children at 70ms intervals instead of arriving together.

## Editing the walkthrough

Scene content lives in three arrays near the bottom of the file — `FILES`,
`SCENES`, and `TICKETS` — plus `HUNKS` for the diff. Each scene is a `build()`
that renders the three panes; add one to `SCENES` and a step button appears
automatically.
