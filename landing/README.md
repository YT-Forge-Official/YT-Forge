# YT-FORGE — landing page

The marketing site for YT-FORGE. A standalone Next.js app that lives inside the
Electron repo but installs and builds independently, so it can deploy to Vercel
(or anywhere) without dragging the desktop app's toolchain along.

```bash
cd landing
npm install
npm run dev      # http://localhost:3000
npm run build    # static prerender
npm start        # serve the build
```

From the repo root you can also use `npm run landing:dev` / `npm run landing:build`.

> **Do not run `next build` while `next dev` is running.** They share `.next/`
> and the dev server will start throwing `__webpack_modules__ is not a function`.
> Stop dev first, or `rm -rf .next` and restart it afterwards.

## Layout

```
app/
  layout.jsx      fonts + metadata (OG, Twitter, icons)
  page.jsx        section order — the whole page is assembled here
  globals.css     design tokens, composites, keyframes
components/       one file per section, plus ui.jsx primitives
lib/
  site.js         SINGLE SOURCE OF TRUTH — version, links, copy blocks
  github.js       star/fork counts, revalidated hourly
  reveal.js       one IntersectionObserver for every [data-reveal]
public/           icon.png, banner.png, screenshot1.png, screenshot2.png
```

## Shipping a new app version

Bump `VERSION` in `lib/site.js`. Every download URL, the hero chip, the CTA
sub-label and the footer follow from it — nothing else to touch, as long as the
GitHub release assets keep the casing electron-builder emits (`YT-Forge`, not
`YT-FORGE`):

```
YT-Forge-<version>-arm64.dmg          macOS Apple Silicon
YT-Forge-Setup-<version>.exe          Windows x64 + ARM
YT-Forge-<version>.AppImage           Linux x64
YT-Forge-<version>-arm64.AppImage     Linux ARM
```

If a release adds a platform (an Intel Mac build, say), add it to that
platform's `builds` array in `PLATFORMS` — the download card renders extra
builds as secondary links under the primary button automatically.

## Design system

Monochrome, with one ember accent (`--color-ember: #ff6a2b`) held under roughly
5% of surface area. Everything lives in `app/globals.css`:

- **Surfaces** `--color-bg` `#08090a` → `--color-bg-hover` `#1c1d20`
- **Hairlines** `--color-line-subtle` (6%) → `--color-line-hover` (24%)
- **Ink** `--color-ink` `#f7f8f8` → `--color-ink-4` `#5d6067`
- **Type** Geist for text, Geist Mono for labels and numbers, Poppins for the
  wordmark only (it matches the Photoshop banner). Tight negative tracking is
  the whole personality: `-0.042em` at hero size.
- **Radii** 6px controls, 10px cards, 14px panels. Nothing rounder.
- **Composites** `.panel` `.btn` `.eyebrow` `.halftone` `.rule` — these sit in
  `@layer components` so Tailwind utilities still override them.

Add a scroll reveal by putting `data-reveal` on any element, and stagger it with
`style={{ '--reveal-delay': '120ms' }}`. `prefers-reduced-motion` short-circuits
every animation on the page.

## Deploying

Point Vercel at this subdirectory (set **Root Directory** to `landing`). The page
is fully static apart from the hourly GitHub stats revalidation. Update
`metadataBase` in `app/layout.jsx` once the real domain is live, or the OG image
URLs will keep pointing at the placeholder.
