# Lumière — Frontend Implementation Plan
## Next.js 16 (App Router) + React 19 · v1.0

> Companion to *Lumière Implementation Document v1.2*. The backend (Bun + Elysia: API, presigned image redirects, ZIP streaming, SSE, job queue, image processing) is unchanged and stays authoritative for all data and storage operations. This document covers only the presentation layer.

---

## 1. Scope & Architecture Decision

This plan covers two frontend surfaces, both built in one Next.js app:

- **Client gallery** (`/g/:slug`) — what photographers' clients see.
- **Admin dashboard** (`/admin/*`) — the photographer's tooling.

### Decision: Next.js is the frontend + thin BFF; Elysia remains the API/storage backend

```
            ┌─────────────────────────── one origin: photos.yourdomain.com ──────────────────────────┐
 browser ──►│  nginx (VPS, TLS)                                                                       │
            │     ├─ /_next, /g, /admin, /          → Next.js server   (Node container, :3001)        │
            │     ├─ /api/*                          → Elysia            (Bun container, :3000)        │
            │     ├─ /events/*  (SSE)                → Elysia            (streaming, no buffering)      │
            │     └─ /img/*     (presigned 302)      → Elysia → 302 → s3.photos.yourdomain.com         │
            └──────────────────────────────────────────────────────────────────────────────────────────┘

 Next RSC (server-side) ──fetch──► http://<bun>:3000/api/*   (internal, cookies forwarded)
 Next client components ──fetch/EventSource──► /api, /events  (same origin, via nginx)
```

**Why keep Elysia rather than fold the API into Next route handlers / server actions:**

- The backend is **Bun-native** — `bun:sqlite`, the SQLite-backed job queue, the Sharp pipeline, S3 presigning, and **streamed ZIP downloads**. Next.js targets the Node runtime; reimplementing these as Next route handlers means losing the Bun APIs and rewriting working, well-suited code.
- **Streaming endpoints** (multi-GB ZIP downloads, long-lived SSE) are cleaner and more predictable in Elysia than in Next route handlers.
- **Separation of concerns** — presentation/rendering vs. data/storage. Either tier can be redeployed independently.

So Next.js does rendering, routing, auth-gating, and client interactivity; Elysia does everything data/storage. They share **one origin** through nginx, so cookies (admin JWT, gallery session) are same-origin and Just Work.

### Note on the SSR-vs-SPA reversal

v1.2 chose an SPA specifically to avoid hand-rolling SSR. Next.js removes that cost — server rendering becomes ergonomic via React Server Components. That changes the calculus: the gallery shell and metadata can now be **server-rendered cheaply**, eliminating the client fetch waterfall the palette-placeholder system was partly compensating for. We lean into RSC for initial loads. (The earlier "no SEO value" point still holds for private galleries — see §11 on metadata — but first-paint and waterfall elimination are reasons enough.)

---

## 2. Tech Stack (frontend)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router | RSC, streaming, Turbopack (default), Node middleware (stable) |
| React | React 19.2 (via App Router canary) | React Compiler enabled (auto-memoization, stable in 16) |
| Language | TypeScript (strict) | Shared types with backend via a `packages/types` workspace |
| Styling | Tailwind CSS v4 | Matches backend doc; theme via CSS variables + `data-theme` |
| Server state (client) | TanStack Query v5 | Mutations, infinite scroll, SSE reconciliation |
| UI/global state | Zustand (small stores) | Lightbox, favorites drawer, upload queue UI only |
| Drag & drop | dnd-kit | Admin photo reorder |
| Animation/gestures | Framer Motion | Lightbox swipe/momentum, transitions |
| Forms/validation | React Hook Form + Zod | Zod schemas shared with backend validation |
| Image rendering | `next/image` + **custom loader** | Loader → `/img/...`; Next optimizer bypassed (see §8) |
| Icons | lucide-react | |
| Charts (admin analytics) | Recharts (code-split) | Loaded only on the analytics route |
| Runtime (prod) | Node 22 (`node:22-slim`) | Run Next on Node, not Bun, in production (§16) |

---

## 3. Project Structure

A monorepo so the frontend and Bun backend can share types and Zod schemas.

```
lumiere/
├── apps/
│   ├── api/                         # existing Bun/Elysia backend (unchanged)
│   └── web/                         # this Next.js app
│       ├── app/
│       │   ├── layout.tsx           # root layout, fonts, providers
│       │   ├── globals.css
│       │   ├── (gallery)/
│       │   │   └── g/
│       │   │       └── [slug]/
│       │   │           ├── layout.tsx        # gallery theme provider + access boundary
│       │   │           ├── page.tsx          # RSC: access check → cover + grid
│       │   │           ├── unlock/page.tsx   # password gate (when locked)
│       │   │           └── [folderId]/page.tsx
│       │   └── (admin)/
│       │       └── admin/
│       │           ├── layout.tsx            # auth guard + dashboard shell
│       │           ├── page.tsx              # dashboard home
│       │           ├── login/page.tsx
│       │           └── galleries/
│       │               ├── page.tsx          # gallery list
│       │               └── [id]/
│       │                   ├── page.tsx       # editor
│       │                   ├── photos/page.tsx
│       │                   └── analytics/page.tsx
│       ├── components/
│       │   ├── gallery/             # Hero, PhotoGrid, Lightbox, FavoritesDrawer, DownloadModal
│       │   └── admin/               # GalleryEditor, PhotoManager, UploadWidget, charts
│       ├── lib/
│       │   ├── api-client.ts        # server + client fetch wrappers (cookie-forwarding)
│       │   ├── image-loader.ts      # custom next/image loader
│       │   ├── use-upload-sse.ts    # EventSource hook for job progress
│       │   └── query-keys.ts
│       ├── stores/                  # zustand: lightbox, favorites, upload
│       ├── middleware.ts            # /admin gate
│       ├── next.config.ts
│       └── package.json
├── packages/
│   └── types/                       # shared TS types + Zod schemas (api ↔ web)
└── ...
```

---

## 4. Routing & Rendering Strategy

Per-route rendering chosen deliberately — RSC where the server can pre-resolve data, client components where there's interactivity.

| Route | Rendering | Rationale |
|---|---|---|
| `/g/[slug]` | **RSC (dynamic)** | Server does the gallery-access check + fetches metadata, renders cover + grid shell. No client waterfall. Photo list streamed via Suspense. |
| `/g/[slug]/unlock` | RSC shell + client form | Branded password gate; form posts to Elysia `unlock`, sets session cookie, redirects. |
| `/g/[slug]/[folderId]` | RSC (dynamic) | Same as gallery, scoped to a folder. |
| Lightbox | **Client component** (intercepting route optional) | Gestures, keyboard nav, preloading. Can use a parallel/intercepting route for shareable `?photo=` deep links without leaving the grid. |
| `/admin/*` | **Mostly client**, RSC shells | Behind auth; highly interactive (dnd, uploads, live charts). RSC for initial list/data, client islands for interaction. |
| `/admin/login` | Client | Form → Elysia login → sets JWT cookies. |

Notes:
- `params`/`searchParams` are **async** in Next 16 — `await` them in server components.
- Galleries are `dynamic` (per-request cookie + access check); do **not** statically cache rendered gallery HTML. Use `export const dynamic = 'force-dynamic'` on gallery routes, or rely on cookie access making them dynamic.
- Use React `Suspense` to stream the photo grid after the cover, so first paint isn't blocked on the full photo list.

---

## 5. Data Fetching & API Integration

### Server-side (RSC)

RSC components fetch from Elysia over the **internal network** and forward the incoming request cookies so the backend can validate the session.

```ts
// lib/api-client.ts  (server)
import { cookies } from 'next/headers';

const INTERNAL_API = process.env.INTERNAL_API_URL!; // http://api:3000 (container network)

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${INTERNAL_API}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieHeader },
    cache: 'no-store',                 // gallery/admin data is per-request
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}
```

Gallery page (RSC) does the access decision server-side:

```tsx
// app/(gallery)/g/[slug]/page.tsx
export const dynamic = 'force-dynamic';

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await apiServer<GalleryAccess>(`/api/gallery/${slug}/access`);
  if (access.state === 'expired')  return <ExpiryScreen gallery={access.gallery} />;
  if (access.state === 'locked')   redirect(`/g/${slug}/unlock`);
  const gallery = await apiServer<GalleryView>(`/api/gallery/${slug}/photos`);
  return (
    <GalleryThemeProvider theme={gallery.theme} customCss={gallery.customCss}>
      <Hero gallery={gallery} />
      <Suspense fallback={<GridSkeleton palette={gallery.coverPalette} />}>
        <PhotoGrid gallery={gallery} />
      </Suspense>
    </GalleryThemeProvider>
  );
}
```

> This requires a small backend addition: a lightweight `GET /api/gallery/:slug/access` returning `{ state: 'ok'|'locked'|'expired', gallery: {...minimal} }` so the RSC can branch before fetching the full photo set. (Add to Elysia client-facing routes.)

### Client-side

TanStack Query against the same origin (`/api/*` via nginx) for mutations and incremental loads: infinite-scroll pagination of photos, favoriting, submitting favorites, download size estimates, admin CRUD. CSRF token (from `GET /api/auth/csrf`) attached to all mutating requests as a header.

---

## 6. Auth, Sessions & Middleware

- **Same-origin cookies.** Because nginx fronts one origin, the admin JWT (httpOnly, `SameSite=Strict`) and gallery session token (httpOnly, `SameSite=Lax`) are sent on both Next and Elysia requests. RSC forwards them server-side (§5); client requests send them automatically.
- **Admin gate** via `middleware.ts` (Node runtime, stable in Next 16): cheap presence/shape check on the JWT cookie for `/admin/*`, redirect to `/admin/login` when absent. The authoritative check still happens in Elysia on each API call — middleware is a fast first gate, not the security boundary.
- **Gallery gate** is handled in the RSC route (`access.state === 'locked'` → redirect to `/unlock`), since it depends on the per-gallery session cookie and backend state, not a static rule.
- **CSRF:** mutations from the client carry a CSRF token header; the backend enforces it (per v1.2 §14). `SameSite` is defense-in-depth.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin') && !req.nextUrl.pathname.startsWith('/admin/login')) {
    if (!req.cookies.get('lumiere_jwt')) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ['/admin/:path*'] };
```

---

## 7. Image Handling (the important one)

Images are already optimized WebP derivatives, served by Elysia as **short-lived presigned 302 redirects** (`/img/:gid/:pid/:size`). We must **not** let Next's image optimizer fetch/re-encode them — it would pull full images through the Next server, fight the short presign TTL, and duplicate work already done in Sharp.

**Custom loader** maps to the backend image proxy:

```ts
// lib/image-loader.ts
'use client';
export default function lumiereLoader({ src }: { src: string }) {
  return src; // src is already /img/:gid/:pid/:size — Elysia 302s to a presigned URL
}
```

```ts
// next.config.ts
const config = {
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    // presigned hosts the browser will be redirected to:
    remotePatterns: [{ protocol: 'https', hostname: 's3.photos.yourdomain.com' }],
  },
  reactCompiler: true,
  output: 'standalone',
};
export default config;
```

Usage with palette placeholder (no layout shift):

```tsx
<Image
  src={`/img/${galleryId}/${photo.id}/thumb`}
  width={photo.width} height={photo.height}
  loading="lazy"
  placeholder="blur"
  blurDataURL={paletteToDataUrl(photo.colorPalette)}  // tiny SVG/solid from stored palette
  alt=""
/>
```

- **Thumbnails** use the longer presign TTL (per v1.2 §17) so re-scrolling doesn't re-pull. The loader can request `/img/.../thumb` for grid and `/img/.../preview` for lightbox.
- **Lightbox preloads** adjacent `preview` URLs (prev/next) on open and on navigate.
- `paletteToDataUrl` builds a 1–4 color gradient SVG `data:` URI from `photo.colorPalette` — this is the v1.2 placeholder system, now wired into `blurDataURL`.
- Image **bytes never flow through Next** — only the `/img` redirect does, and even that is served by Elysia. Next renders markup; the browser fetches pixels from S3/MinIO directly. (Bandwidth reality from v1.2 §17 still applies: bytes leave over the home uplink.)

---

## 8. Upload UI + SSE (admin)

The upload widget posts multipart to Elysia (`POST /api/galleries/:id/photos`), receives `{ batchId, photoIds }`, then opens an SSE connection to `/events?batch=...` for per-file progress driven by the backend job queue.

```ts
// lib/use-upload-sse.ts
'use client';
export function useUploadSSE(batchId: string | null, onEvent: (e: UploadEvent) => void) {
  useEffect(() => {
    if (!batchId) return;
    const es = new EventSource(`/events?batch=${batchId}`); // same origin via nginx → Elysia
    es.onmessage = (m) => onEvent(JSON.parse(m.data));
    es.addEventListener('done', () => es.close());
    return () => es.close();
  }, [batchId, onEvent]);
}
```

- Per-file rows render `queued → processing → ready | error` with the reasons from v1.2 §9, optimistic thumbnails on `ready`.
- A small Zustand `uploadStore` holds the live batch state so the widget survives route changes within `/admin`.
- On `done`, invalidate the photos TanStack Query so the manager reflects the new set.
- nginx already sets `proxy_buffering off` on the app path (v1.2 §8), required for SSE.

---

## 9. Client Gallery Components

- **Hero / Cover** — full-bleed cover (RSC-rendered `Image`), title/subtitle/date, branding, download CTA, favorites count.
- **PhotoGrid** — three layouts (uniform grid / masonry / cinematic slideshow) chosen by `gallery.layout`; palette placeholders; infinite scroll (TanStack `useInfiniteQuery`) or pagination per gallery setting; folder tabs when present; keyboard navigable.
- **Lightbox** (client) — Framer Motion momentum swipe on touch, arrow keys on desktop, adjacent `preview` preload, favorite toggle, single-photo download (`/api/gallery/:slug/download/:photoId`), share button copying a `?photo=` deep link. Consider an **intercepting route** so the lightbox is a URL state (shareable, back-button friendly) without a full navigation.
- **FavoritesDrawer** (client) — Zustand-backed open state; lists favorited photos with per-photo notes; shareable favorites link; submit triggers backend notification.
- **DownloadModal** (client) — scope selector (all / folder / favorites), size estimate fetched before confirm, optional email gate; kicks off the streaming ZIP from Elysia.

---

## 10. Admin Dashboard Components

- **Dashboard Home** (RSC list + client cards) — gallery cards (cover, status, views, last accessed), storage usage (from backend S3 query), activity feed.
- **GalleryEditor** (client, RHF + Zod) — all gallery settings from v1.2 §12; QR code generated client-side; "email client" and "duplicate" call backend actions.
- **PhotoManager** (client) — dnd-kit reorder (persist via `PATCH .../photos/reorder`), multi-select + bulk delete, folder management, replace photo, the UploadWidget (§8).
- **Analytics** (RSC data + Recharts, code-split) — views over time, downloads log, per-photo favorites, device split. Recharts loaded only here via `next/dynamic` to keep the main admin bundle lean.

---

## 11. Styling, Theming & Metadata

- **Tailwind v4** with CSS-variable design tokens; gallery theme applied via `data-theme="light|dark|custom"` on the gallery layout wrapper.
- **Per-gallery custom CSS** — sanitized server-side, injected scoped to the gallery container, served under the CSP from v1.2 §8 (`style-src 'self' 'unsafe-inline'`). Never inject raw photographer CSS into `<head>` unscoped.
- **Metadata / SEO** — private (password) galleries emit `robots: { index: false }` via `generateMetadata`. Public galleries may emit Open Graph tags using the cover image for share previews. Admin routes always `noindex`.

---

## 12. Performance

Ties to v1.2 §17 targets.

- **RSC streaming + Suspense** — cover paints before the photo list resolves.
- **React Compiler** (stable in 16) — auto-memoization; avoid manual `useMemo`/`useCallback` churn.
- **Route prefetching** — App Router prefetches linked routes; gallery folder tabs and admin nav benefit.
- **Image lazy loading** + palette placeholders → zero layout shift, LCP driven by the cover (a single eager `Image priority`).
- **Code-splitting** — lightbox, charts, and the upload widget via `next/dynamic` so the gallery and admin entry bundles stay small.
- **Caching caveat** — gallery routes are per-request dynamic (cookies); don't cache rendered gallery HTML. Cache only truly public, static assets.

---

## 13. Deployment

Add a Next.js container alongside the Bun app; nginx routes by path (one origin).

```dockerfile
# apps/web/Dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build            # next build (standalone output)

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
```

```yaml
# addition to home-server docker-compose.yml
  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    container_name: lumiere-web
    restart: unless-stopped
    ports: ["3001:3001"]
    environment:
      NODE_ENV: production
      INTERNAL_API_URL: http://app:3000      # Elysia, container network
      NEXT_PUBLIC_BASE_URL: https://photos.yourdomain.com
    depends_on: [app]
```

nginx (extends v1.2 §8 app server block — route by path, same origin):

```nginx
# inside server { server_name photos.yourdomain.com; ... }

location /api/    { proxy_pass http://<tunnel-home-addr>:3000; proxy_buffering off; proxy_read_timeout 300s; }
location /events/ { proxy_pass http://<tunnel-home-addr>:3000; proxy_buffering off; proxy_read_timeout 600s; }
location /img/    { proxy_pass http://<tunnel-home-addr>:3000; }       # 302 → s3 host
location /        { proxy_pass http://<tunnel-home-addr>:3001; }       # Next.js (UI, /_next, /g, /admin)
```

> **Runtime choice:** run Next on **Node** in production, not Bun. Next.js is Node-targeted; Bun support has rough edges that aren't worth the risk for the render tier. The Bun advantage stays where it matters — the Elysia backend.

---

## 14. Required Backend Additions

Small, additive changes to the Elysia API to support RSC fetching:

1. `GET /api/gallery/:slug/access` → `{ state: 'ok'|'locked'|'expired', gallery: {minimal} }` so the RSC can branch before loading the full photo set.
2. Ensure `GET /api/gallery/:slug/photos` returns `colorPalette`, `width`, `height`, `theme`, and `customCss` in its payload (for placeholders + theming).
3. Confirm cookies are validated when forwarded server-to-server from Next RSC (same tokens, just a different client). No new auth model — same JWT / gallery-session cookies.

Everything else (image proxy, SSE, ZIP, uploads, CRUD) is consumed as-is.

---

## 15. Phase Plan (frontend, aligned to backend phases)

### Phase 1 — Core
- Next 16 app scaffold, Tailwind v4, shared `packages/types`, API client (server + client), middleware auth gate.
- Admin: login, gallery list, gallery editor (core fields), photo manager with upload widget + SSE, custom `next/image` loader.
- Client gallery: RSC access flow, password gate, grid layout, lightbox, presigned image rendering with palette placeholders, full-gallery download.

### Phase 2 — Client Experience
- Masonry + slideshow layouts; favorites drawer; folders + tabs; expiry/countdown screen; refined placeholder transitions.

### Phase 3 — Polish & Power
- Watermark preset UI; analytics (Recharts, code-split); QR codes; per-photo download + download-mode UI; comments + moderation; per-gallery custom CSS (sanitized + scoped).

### Phase 4 — Resilience & Polish
- Dark mode; bulk gallery ops; intercepting-route lightbox deep links; bundle-size pass; accessibility audit (keyboard nav, focus traps in lightbox/modals, alt text strategy).

---

## 16. Open Decisions & Risks

- **Next on Node vs Bun** — recommended Node for the render tier (above). Revisit if Bun's Next support matures.
- **RSC server-fetch latency** — server-to-server hop adds a little latency; mitigated by the internal container network (`INTERNAL_API_URL`) and `Suspense` streaming so it isn't on the critical first-paint path.
- **Folding the API into Next later** — possible via route handlers/server actions, but not recommended while the backend depends on Bun-native features (see §1). Kept as an explicit non-goal.
- **Two servers, one origin** — slightly more deployment surface than the v1.2 single-Bun-server SPA. The tradeoff buys ergonomic SSR/RSC and `next/image` plumbing. If that's not worth it, the v1.2 Vite SPA remains a valid simpler path.
- **`next/image` v16 default changes** — verify the custom-loader path against v16's image defaults during the scaffold (defaults shifted in 16).

---

*Frontend plan v1.0 — Next.js 16 App Router + React 19, BFF over the unchanged Bun/Elysia backend, one origin via nginx. Begins at Phase 1 alongside the backend.*
