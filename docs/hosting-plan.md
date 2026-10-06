# Going public: hosting & photo architecture

Status: proposal (2026-10-01). Prices checked 2026-10-01 on the providers' own pages (sources at the end).

## The short version
Keep the site **static** and put photos in **object storage with free egress**:

- **Site** (index.html, js, baked map tiles, opening plates) → **Cloudflare Pages / Workers static assets**: static requests are free and unlimited.
- **Photos** → **Cloudflare R2** behind a custom domain: $0.015/GB-month storage, **egress free**, 10 GB free.
- **Never serve originals.** Make 3 sizes once, at upload time (WebP), strip metadata, content-hash the names, cache forever.
- **Phase 1** (only you upload): a local `npm run photos:add` script, so there's no server at all.
  **Phase 2** (other people upload): a small Worker issuing signed upload URLs; the visitor's browser makes the sizes.
- **Check-ins** ("last seen here") add one small Worker for writes. Storage is JSON files in R2, with no database.
- **No database by default.** This is a diary, not a CRUD app: data is written rarely by one person and read as files.
  Add D1 only if it really becomes one (many uploaders, moderation queues, queries across records).

Expected bill: **$0/month** for a normal diary, **≈ $0–5** in a viral month, plus a domain (~$10/yr).

## What the spike measured

**One visit to the map today** (headless Chrome, 1440×860, measured with the Performance API):
~1.05 MB from our own origin over ~80 requests: the opening plates are 855 kB, map tiles 133 kB and JS 54 kB.
The 48 placeholder print thumbnails come on top, at ~25 kB each when properly sized (≈ 1.2 MB).

**Real hi-res photos** (3 Wikimedia Commons JPEGs of Afghanistan, 6.9–9.8 MB, 3872 px wide up to a 9216 px panorama),
resized with `sharp`:

| derivative | width | JPEG q80 | WebP q78 | AVIF q50 |
|---|---|---|---|---|
| print (pile on the map) | 480 | 9–39 kB | 9–40 kB | 7–31 kB |
| view (lightbox) | 1600 | 84–326 kB | 84–296 kB | 52–203 kB |
| full (big screens) | 2560 | 210–699 kB | 217–649 kB | 122–389 kB |

- The lightbox version is **25–40× smaller** than the original, so serving originals would be the single biggest cost.
- EXIF, **including GPS**, is gone from every derivative by default (checked). This matters for this trip.
- WebP ≈ JPEG at this quality; AVIF saves ~35% but encodes 2× slower. **Ship WebP**; add AVIF later via `<picture>` if bandwidth ever matters.
- **In the browser** (`createImageBitmap` + `OffscreenCanvas.convertToBlob('image/webp')`, headless Chrome): ~0.9 s per
  photo for all three sizes, with the same sizes as sharp and no metadata. So for Phase 2, uploaders' devices can do the
  resizing, and we need no paid image service or server CPU.

## Cost model
Assumptions: ~5 MB and ~90 requests per visit (the map + all print piles + ~10 lightbox views).
Library: 2,000 photos, 16 GB of originals and 1.8 GB of derivatives.

| month | traffic | Vercel Hobby | Vercel Pro | Bunny CDN + storage | **Cloudflare Pages + R2** |
|---|---|---|---|---|---|
| quiet: 2k visits | 10 GB, 0.2M req | $0 | $20 | ~$1 (minimum) | **$0** |
| healthy: 20k visits | 100 GB, 1.8M req | at the cap (100 GB / 1M req), then paused | $20 + extra requests | ~$2–6 | **~$0.15** (storage over 10 GB) |
| viral: 500k visits | 2.5 TB, 45M req | not allowed | ≈ $250+ (1.5 TB × $0.15 + requests) | ~$25–150 (region-dependent $0.01–0.06/GB) | **≈ $0–5** (R2 reads past 10M free; most served from cache) |

Why not Vercel for this:
- Hobby is **non-commercial only** and has hard included limits.
- Pro's Flat Rate CDN explicitly **excludes** "large-scale delivery of media or files where such delivery constitutes a
  majority of bandwidth" — exactly a photo diary. So media would be billed on-demand at $0.15/GB after 1 TB.
- Vercel Image Optimization charges per transformation; we don't need runtime transforms at all.

Bunny is a fine fallback (cheap, simple, $1 minimum), but it bills every GB. Our audience includes Asia and the
Middle East ($0.03–0.06/GB), so R2's free egress wins.

## Architecture

```
            ┌──────────── Cloudflare ────────────┐
visitor ──► │ Pages / static assets  (free)      │  index.html, js/, tiles/ (~800 files), tiles/intro/
            │                                     │
            │ photos.<domain> → R2 bucket         │  p/<hash>-480.webp  p/<hash>-1600.webp  p/<hash>-2560.webp
            │   Cache-Control: immutable, 1 year  │  (public; names are content hashes)
            │                                     │
            │ R2 bucket "originals"  (private)    │  untouched originals: archive / future re-renders
            └─────────────────────────────────────┘
data/photos.json  →  { img: "<hash>", w, h, caption, … }   viewer builds the URLs per size
```

### Phase 1: you are the only uploader (do this first)
`npm run photos:add ./my-trip/day-03 --place "Band-e Amir" --day 3`
1. Read EXIF **before** stripping: the date, and GPS as a *suggested* lon/lat. You choose the precision
   (exact / approx / hidden), as in `docs/pin-drop-plan.md`.
2. `sharp`: rotate per EXIF → 480 / 1600 / 2560 WebP → metadata stripped → name = short content hash.
3. Upload the derivatives to the public bucket and the original to the private bucket. Use the S3 API with an R2 token:
   `@aws-sdk/client-s3` or `rclone`.
4. Append the stack/photos to `data/photos.json`, then `git push`. Pages redeploys in seconds.

There's no server, login or database: the attack surface is a static site plus a write token on your laptop.

### Phase 2: other people upload (only when needed)
- **Auth:** invited contributors only → Cloudflare Access (free for small teams). Open sign-ups would need a real auth
  provider and moderation. Decide this explicitly; it changes the product.
- **Upload:** the browser resizes (proven above) → a Pages Function / Worker checks the user and issues **presigned PUT
  URLs** with a size cap and content type → the browser uploads straight to R2. The Worker never touches image bytes.
- **Metadata:** if contributors arrive, this is the point where D1 (SQLite; free tier: 5 GB, 5M rows read/day) earns
  its place: pending/approved states and per-user listings are real queries. Until then `photos.json` stays a file.
- **Abuse guards:** per-user quota, max bytes in the presign, rate limiting, and no public listing of the originals bucket.
- Workers free plan: 100k dynamic requests/day. Only uploads/API calls count; viewing photos is static and free.

### Check-ins: "last seen here" (adds a small backend now)
Check-ins are live data, so the site is no longer purely static. The read path stays static; only writes need code,
and storage is plain JSON files in R2 (**no database, no Supabase**): one file per check-in, plus one public summary.

```
phone ──POST──► Worker /api/checkin   (auth: Cloudflare Access or a secret token)
                   │  validate (lat/lon range, accuracy, size), rate-limit
                   ├─► R2 private  checkins/2026-10-03T08-12-05Z.json   { ts, lat, lon, accuracy, note, precision }
                   └─► R2 public   checkin/latest.json                  public view: delayed / coarsened
Cron Trigger (every 15 min): list the newest private check-ins → rewrite latest.json once a delay has passed
visitors ──GET──► photos.<domain>/checkin/latest.json   (static, Cache-Control: max-age=60, no Worker invocation)
```

Why files, not a database: a few check-ins a day, and only two reads ever happen ("the latest" and, for backup,
"all of them"). Time-sorted keys make "newest" a single `list` with a prefix. Each check-in is one
Class A write (1M/month free). The history is downloadable with `rclone`, so backups and migration are trivial.
Rejected: Workers KV (free tier only 1,000 writes/day, and one more service), Supabase (a second provider and
account, free projects pause, egress billed), and committing `latest.json` to git (location history ends up
permanently in the repo, and every check-in triggers a rebuild).

- **Input (built, 2026-10-01)**: a plain private page, `checkin/index.html`, used only when online. Type a town, place
  or street name (OpenStreetMap Nominatim lookup, Afghanistan only), or coordinates / a full Google Maps link. A
  small OSM preview with a draggable pin, a public note, a precision choice (town / province / exact / hidden), Submit,
  and Undo. **No key or password** (the user asked to keep it simple): locally only this computer can reach it;
  in production it sits behind Cloudflare Access (email code), and the Worker verifies the Access JWT
  (`Cf-Access-Jwt-Assertion`) on every write. The user's phone is Android.
- **Built locally**: `npm run dev` (`tools/dev-server.mjs`, port 5174) is a stand-in for the Worker with the same rules
  (`js/checkin/core.js`, tested by `tests/checkin.test.mjs`). Private history goes to `~/.field-notes/checkins/`, the
  and the public view to `local-r2/public/checkin/latest.json`.
  The map pin is `js/map/checkin-pin.js`, re-checked every 30 s, so it updates live.
- **Guardrails**: local-only binding (127.0.0.1) + Origin check (other sites → 403); in production, Access JWT; JSON only; 4 KB cap (413); finite coordinates inside Afghanistan +
  margin; text cleaned and capped; unknown fields dropped; >130 km/h since the last check-in needs confirming; 30 s
  gap and 30/day; no CORS; no coordinates in logs; private files 0600 outside the served folder; the public file holds
  only whitelisted fields; the note is rendered as text; Undo; kill switch `RULES.publish`.
- **Publish mode**: `RULES.mode = 'latest'` (live, as asked), snapped to town by default. `'previous'` is the safer
  one-behind option.
- **Public vs private**: the Worker writes two things. Exact + live goes to the private R2 prefix and, if wanted, to a family-only view
  behind Access. The **public** `latest.json` gets what the publish rule allows: a **time delay** (shown only after N
  hours, or only once you've checked in somewhere else) and **precision** (exact / town / region, per check-in or by default).
  A Cron Trigger publishes delayed check-ins; one switch hides check-ins entirely.
- **Viewer**: fetch `latest.json`, place it with `geo.toMap` (the same warp as the drawing, so it lands beside the right
  drawn town), and draw a hand-drawn red pin + "last seen here · 2 days ago" in Kabul time. It's a map-unit layer like the
  stacks. Outside the map frame (e.g. not yet arrived): an arrow at the sheet edge.
- **Cost**: still ~$0. Workers free (100k req/day, and only check-ins hit it), Cron free, and writes and reads stay inside R2's free tier.

### Viewer changes (small)
- `photos.js`: build URLs from the hash: `-480` for piles, `-1600` in the lightbox, and `-2560` when the screen is wider than ~1400 css px
  or DPR ≥ 2. Keep the existing "show the small one, swap in the big one on load" behaviour.
- Tiles: unchanged. Optionally serve them from R2 too, if the static asset limits (20,000 files, 25 MiB per file) ever bind.
  Today: ~800 files, all small.

## Decisions to make
1. **Domain**: register or move DNS to Cloudflare. R2 custom domains need the zone on Cloudflare; the `r2.dev` URL is
   rate-limited and not for production.
2. **Who uploads**: you only (Phase 1) vs invited contributors vs the public. Recommendation: Phase 1 now; Phase 2 with Access when
   someone else actually needs to upload.
3. **Check-in visibility**: what the public sees (delay, precision) vs a family-only exact/live view.
4. **Originals**: keep them in a private R2 bucket (~$0.25/month per 16 GB above the free 10 GB) or only on your own disk/backup.

## Risks / notes
- **Hot-linking** of photos costs us nothing in egress, only cheap read ops; add a WAF hotlink rule if it ever shows up.
- **iPhone HEIC**: the phone's photo picker usually hands browsers a JPEG. The local script should convert HEIC
  (sharp/libvips needs HEIF support — test with a real iPhone export).
- **Privacy**: originals keep GPS, so they must never be in a public bucket. Derivatives are clean (verified).
- **Pricing changes**: re-check the numbers above before committing; all are list prices as of 2026-10-01.

## Sources
- Vercel pricing: https://vercel.com/pricing
- Vercel fair use (Hobby is non-commercial): https://vercel.com/docs/limits/fair-use-guidelines
- Vercel Flat Rate CDN tiers and out-of-scope media: https://vercel.com/docs/pricing/flat-rate-cdn
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Workers pricing (static assets free and unlimited, D1 free tier): https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Images pricing: https://developers.cloudflare.com/images/pricing/
- Bunny.net pricing: https://bunny.net/pricing/
- Spike scripts: session scratchpad `imgspike/derive.js` (sharp) plus an in-browser OffscreenCanvas test.
