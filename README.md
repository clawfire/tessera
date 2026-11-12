# Tessera

**A self-hosted, open-source "link in bio" page made of draggable widgets.**
Think bento-style personal page — links, music, maps, events, goals, galleries, forms — but on *your* domain, as one static HTML file, with no account, no database and no tracking.

```
page.json  ──►  node scripts/build.mjs  ──►  dist/index.html  ──►  any static host
   ▲                                                                    │
   └──────── edit visually at yoursite/#edit, export page.json ◄────────┘
```

## Why

- **Own it.** Your page is a JSON file in your git repo. Host it on GitHub Pages, Netlify, Cloudflare Pages, a Raspberry Pi, YunoHost, an S3 bucket — anything that serves HTML.
- **Zero dependencies.** Vanilla JS + CSS. Node ≥ 18 only for the build. Nothing to `npm install`.
- **Fast & indexable.** The build prerenders the page with the same code the browser runs, inlines everything, and emits SEO/Open Graph tags. ~60 KB before your images.
- **Visual editor.** Add `#edit` to the URL: drag to reorder, resize, edit fields live, switch themes, undo. No backend — the draft lives in your browser until you export it.
- **Privacy-friendly embeds.** YouTube via `youtube-nocookie`, Vimeo with `dnt=1`, maps from OpenStreetMap, calendar files generated client-side.

## Quick start

```bash
git clone https://github.com/clawfire/tessera my-page && cd my-page
npm run dev          # http://localhost:5173  ·  editor: http://localhost:5173/#edit
```

1. Open `/#edit`, build your page (profile, theme, widgets).
2. Click **Export** → you get a `page.json`. Replace the one at the repo root (put images in `assets/`).
3. Commit & push. CI builds `dist/` and deploys.

```bash
npm run build         # dist/index.html + dist/assets/
npm run build:single  # one HTML file, local assets inlined as data URIs
```

Set `TESSERA_URL=https://you.example.com` at build time for absolute `og:url` / `og:image`.

## Deploy

| Host | How |
|---|---|
| **GitHub Pages** | Included workflow `.github/workflows/pages.yml`. Settings → Pages → Source: *GitHub Actions*. Custom domain: add a `CNAME` file at the repo root (copied to `dist/`). |
| **Netlify** | Included `netlify.toml` (build `node scripts/build.mjs`, publish `dist`). |
| **Cloudflare Pages** | Build command `node scripts/build.mjs`, output `dist`. |
| **Your own server** | `npm run build && rsync -a dist/ server:/var/www/me/` |

## Widgets

| Type | What it does | Sizes |
|---|---|---|
| `link` | Smart link card — detects ~40 platforms (Instagram, GitHub, Mastodon, Bluesky, Printables…) for name, colour and glyph. Adds `rel="me"` for Mastodon verification. | 1×1 2×1 2×2 4×1 |
| `text` | Title + markdown-lite (`**bold**`, `*italic*`, `[link](url)`) | 1×1 2×1 1×2 2×2 4×1 |
| `image` | Photo with caption and optional link | all |
| `gallery` | Swipeable carousel (CSS scroll-snap), one `url \| caption` per line | 2×2 2×1 4×2 4×1 1×2 |
| `video` | YouTube, Vimeo, PeerTube or `.mp4` | 2×1 2×2 4×1 4×2 |
| `music` | Spotify, Apple Music, SoundCloud, Deezer, Bandcamp embed, or an audio file | 2×1 2×2 4×1 1×2 |
| `map` | OpenStreetMap embed with a label | 1×1 2×1 2×2 4×1 |
| `event` | Date card, tickets button, **Add to calendar** (`.ics` generated in the browser) | 1×1 2×1 2×2 |
| `stat` | Big number + label | 1×1 2×1 |
| `countdown` | Live countdown to a date | 1×1 2×1 |
| `goals` | Progress bars, one `label \| percent` per line | 2×1 2×2 4×1 1×2 |
| `list` | Experience / services / anything: `title \| subtitle \| dates \| url` | 2×2 2×1 1×2 4×1 4×2 |
| `newsletter` | Email form posting to any provider (Buttondown, Listmonk, Mailchimp, Brevo…) | 2×1 2×2 4×1 |
| `contact` | Topic + message form that opens the visitor's mail app (`mailto:`) — no server | 2×2 1×2 |
| `embed` | Any https iframe: Cal.com, Calendly, Google Calendar, Framaforms… | 2×2 2×1 4×1 4×2 1×2 |
| `section` | Thin full-width heading to group cards | full width |

Every widget also has a **style**: `default` (card), `accent`, `dark` (inverted) or `ghost` (transparent).

The grid is 4 columns on desktop and 2 on mobile (4-wide cards collapse to 2). `grid-auto-flow: dense` fills the gaps, so order matters but holes don't.

## `page.json`

```jsonc
{
  "version": 1,
  "settings": {
    "title": "Page title (SEO)",
    "description": "Meta description",
    "lang": "en",                    // "en" | "fr" — visitor-facing strings
    "showEditButton": false,         // floating ✎ button for visitors (edits stay local to their browser)
    "footer": "Made with [Tessera](https://github.com/clawfire/tessera)",
    "profile": { "avatar": "assets/me.jpg", "name": "", "tagline": "", "location": "", "bio": "" },
    "theme": { "bg": "#F6EFE6", "card": "#FFFFFF", "text": "#2A211C", "accent": "#D9822B", "radius": 22, "font": "system" }
  },
  "widgets": [
    { "id": "hello", "type": "text", "size": "2x1", "tone": "default", "props": { "title": "Hi", "body": "…" } }
  ]
}
```

Theme keys: `bg`, `card`, `text`, `accent`, `radius`, `font` (body), `display` (captions, badges, counters), `dark` (background of inverted cards) and `fontCss` (an optional `@font-face` stylesheet, relative or https). Text on accent and inverted cards picks the most readable colour automatically (WCAG contrast).

Fonts: `system`, `rounded`, `serif`, `mono`, plus `inter` and `dosis` (shipped self-hosted in `assets/fonts/`, SIL OFL). No third-party font CDN.

### Theme presets

Warm · Paper · Mint · Night · Ember · **Clawfire** · **Clawfire Night**

Clawfire is a palette of Spring Wood `#F8F5F1`, Almond `#E8DDCB`, Tan `#CDB37F`, Mosque `#066464`, Blue Whale `#043649` and Midnight `#031734`, set in Inter with Dosis for captions:

```json
"theme": { "bg": "#F8F5F1", "card": "#FFFFFF", "text": "#031734", "accent": "#066464", "dark": "#043649",
           "radius": 20, "font": "inter", "display": "dosis", "fontCss": "assets/fonts/clawfire.css" }
```

## Writing a widget

Widgets live in [`src/widgets.js`](src/widgets.js). One `def()` call is all it takes — the editor builds its form from `fields`:

```js
def('weather', {
  label: 'Weather|Météo',            // "English|Français"
  icon: '☀️',
  sizes: ['1x1', '2x1'],             // first = default
  defaults: { city: 'Luxembourg' },
  fields: [{ key: 'city', label: 'City|Ville' }],
  render: (p, ctx) => `<div class="w-body"><h3>${T.util.esc(p.city)}</h3></div>`
});
```

`render()` must be **pure** (string in, string out, no DOM): it also runs in Node at build time. Always escape user input with `T.util.esc` and URLs with `T.util.safeUrl`.

## Project layout

```
page.json            your content (the only file you really edit)
assets/              your images, audio, PDFs
src/
  index.html         template
  styles.css         theme via CSS custom properties
  i18n.js            page + editor strings (en, fr)
  widgets.js         widget registry + helpers
  render.js          page rendering, countdown ticker, .ics
  editor.js          #edit mode
  app.js             boot
scripts/
  build.mjs          prerender + inline → dist/
  dev.mjs            zero-dependency dev server
```

## Roadmap

- [ ] Publish from the editor (commit `page.json` via the GitHub/Gitea/Forgejo API with a personal token)
- [ ] Touch drag & drop (today: Up/Down buttons on mobile)
- [ ] QR code widget, RSS "latest posts" widget (resolved at build time)
- [ ] More languages (`de`, `lb`, `es`…) — PRs welcome
- [ ] Multiple pages from one repo

## License

[MIT](LICENSE)
