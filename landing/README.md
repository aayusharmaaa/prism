# Prism — landing page

A single self-contained `index.html`. No build step, no dependencies, no network
requests: all CSS, JS and the favicon are inline, and the hero graphic is drawn
on a canvas rather than loaded.

This is the source of truth. It is mirrored to a separate private repo wired to
Vercel — see [Deploying](#deploying).

## Deploy

Prism itself keeps its workspace in a local database, so the app can't run on
Vercel's serverless filesystem. This folder can — deploy it on its own:

```bash
cd landing
npx vercel deploy --prod
```

Vercel detects a static directory and serves `index.html`. Netlify, Cloudflare
Pages, or GitHub Pages work the same way; point them at `landing/`, with no
build command and `landing` as the publish directory.

## Deploying

The deployed copy lives in its own **private** repo (`prism-landing`) containing
just `index.html` plus deploy config, so Vercel builds a one-file static site
with nothing else in the tree.

To push a change here out to it:

```bash
# from the repo root
cp landing/index.html ../prism-landing/index.html
cd ../prism-landing && git commit -am "Update landing page" && git push
```

Vercel redeploys on push.

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
  refusal) rendered inside a recreation of the real app chrome: title bar,
  activity rail, sidebar, tab strip, document header, status bar. Mostly a
  scripted playback, and the page says so in three places — **except step 4,
  which is genuinely interactive**: click or keyboard-activate any diff hunk to
  accept or reject it and watch the counter track your choices.
- **Driving it** — prompt chips jump to a scene, `←` / `→` step, `space`
  toggles playback. Keyboard control unlocks by intent (you've touched the
  player) or geometry, so neither path failing leaves it silently dead.
- **Both themes** — **dark is primary**, living on the bare `:root` so it renders
  even if the stamp is missing or the script never runs. Light is the override,
  reachable from the toggle, persisted in `localStorage`. Both are defined
  purely at token level, so a surface and its text can never resolve from
  different palettes.
- **Reduced motion** — respected throughout: the beam renders at its resting
  state, the player doesn't auto-advance, reveals are disabled.

## Design notes

Near-monochrome. `#101216` ground, `#E9EAE6` ink, and a single muted **pine**
accent. Colour is spent in exactly one place — the refraction — using a
desaturated plate spectrum (`--sp-1` … `--sp-5`) that appears nowhere else.

Typography is a system sans throughout, carrying its weight through scale, 600
weight, and tight negative tracking (`-0.038em` at h1) rather than a display
face. Monospace is the second voice: eyebrows, line numbers, annotations,
terminal.

Depth comes from hairline borders, not shadows — the stylesheet contains no
`box-shadow` at all. Radius stays at 6px. Motion is sparse and slow: one shared
easing curve (`--ease: cubic-bezier(.22,.61,.36,1)`), 0.8s reveals, and a
`.rv-group` class that cascades children at 70ms intervals.

## Editing the walkthrough

Scene content lives in arrays near the bottom of the file — `TREE`, `SCENES`,
`TICKETS`, `HUNKS`, `CHIPS`. Each scene is a `build()` that renders the three
panes and updates the surrounding chrome (tab name, kind and status badges, mode
pill, pending count, footer stats). Add one to `SCENES` and its step button
appears automatically.
