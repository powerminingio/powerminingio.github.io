# Design

This app uses the Power Mining **"Glass"** language, shared with the Bitcube device
dashboard (`pm-miner`) and the hashrate rental portal (`pm-hashrate-rental`).

## One switch

`src/app/globals.css` holds every design token. Change it and the whole page follows.
Do not invent parallel tokens, and do not hardcode a colour in a component — if you
need a value that isn't there, add a token.

`tailwind.config.js` only maps those tokens onto utility names (`bg-card`,
`rounded-pill`, `shadow-menu`, …). It carries no values of its own.

## The rules worth knowing

- **Light only.** There is no dark mode, no `.dark` block and no theme toggle, matching
  the rental portal. `:root` sets `color-scheme: light`. Don't add `dark:` variants.
- **System fonts only.** No webfonts, no `next/font` — `--font-body` and `--font-display`
  are system stacks. This is deliberate and shared with both other properties.
- **Pills.** Every button, tab and badge is a full pill (`rounded-pill`, 980px) with a
  44px minimum height. Heights are `min-h-*`, never fixed: nine locales run long and a
  fixed height clips a wrapped label.
- **Focus is a halo**, not a ring — a 4px soft shadow (`--focus-ring`), applied globally
  to `:focus-visible`. Never reintroduce shadcn's `ring-offset` idiom.
- **Quiet hover** is `bg-foreground/[.035]`, a 3.5% ink tint.
- **Numbers use `tabular-nums`.**
- **Status is written out, not only coloured** — a `<Pill>` says "Flashing", the colour
  only reinforces it.
- **Every animation is guarded** by `@media (prefers-reduced-motion: reduce)`.

## Two gotchas

**`--accent` is the primary blue**, not shadcn's light gray. Stock shadcn components
assume `hover:bg-accent` is a subtle tint; here it would be a full blue wash. Use
`bg-foreground/[.035]` instead.

**`backdrop-filter` creates a containing block for `position: fixed` descendants.** The
`.pm-glass` surfaces (the flash card, the terminal) must never contain the instruction
drawer or a modal, or those will position against the card instead of the viewport.

## The one deliberate duplication

`src/lib/terminal-theme.ts` restates the palette as literal hex, because xterm.js cannot
read CSS variables. If you change a colour in `globals.css`, change its twin there. The
extra ANSI entries (cyan, magenta, bright black) have no token — ESP-IDF emits the full
sixteen colours and Glass only defines some of them.

## Brand assets

`public/pictures/` — `pm-logo.svg` (the wordmark, two-tone, used in the header at 24px),
`pm-favicon.png`, `pm-mark.png` (the bolt-and-P mark, Apple touch icon). Production
serves from a GitHub Pages subpath, so reference them through `asset()` in
`src/lib/utils.ts`, never as a bare `/pictures/…` path.
