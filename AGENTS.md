# AGENTS.md

Onboarding + decision-making reference for AI agents working in this repo. Keep it concise; link out rather than duplicating. See [README.md](README.md) for human build instructions.

## What this is

`tayler-carney-portfolio` is Tayler Carney's personal portfolio — a structural-fashion-design site with an editorial, technical-blueprint aesthetic. It's a **Next.js 16 (App Router) + React 19 + TypeScript** app, styled with **SCSS modules**, content sourced from **Hygraph (GraphCMS)**, deployed on **Vercel**. There is **no database** — all content lives in Hygraph.

The site has a lightweight, **database-free admin editor**: log in with an env-var key at `/admin/login`, then edit most content *inline on the page it lives on* (titles/descriptions via a pencil affordance, page bodies via a block editor). Visitors see zero change.

## Architecture at a glance

- **Rendering**: Server Components by default. Routes are dynamic because every page calls `isAuthed()` (reading cookies) to decide whether to render edit affordances — but reads are **cached at the fetch layer**, which is where the win is. See [cachedReads.ts](src/lib/cachedReads.ts): visitors read through a 60s tagged cache, **admins always read fresh** so the editor never loads stale content it might then save back over. Writes still do not call `revalidateTag` — the read-CDN lag would clobber optimistic UI, which is the original reason and still holds. `getSiteData` and `getProject` are wrapped in React `cache()` for per-request dedupe. Interactive bits are small `"use client"` islands; page-entry animations use Framer Motion (`MotionProvider`, `AnimatedSection`).
- **Data flow**: pages `POST` GraphQL to `process.env.CMS_ENDPOINT`. Public reads attach a read token (`CMS_TOKEN`); writes go through Server Actions using a secret mutation token — never the client.
- **Admin mode**: a single signed, httpOnly cookie. Each server page reads it via `isAuthed()` and threads an `isAdmin` boolean into its client islands; when true, inline edit controls render.
- **Auth boundary**: there is **no middleware/proxy**. Admin pages (`/admin`, `/admin/media`) guard themselves with `if (!(await isAuthed())) redirect("/admin/login")`. **The real authorization boundary is the Server Action** — every write re-verifies the session via `requireAuth`, which now lives in [auth.ts](src/lib/auth.ts) rather than as three private copies. Login is rate-limited and every attempt is logged; see [rateLimit.ts](src/lib/rateLimit.ts).

## Key directories & modules

- `src/app/` — routes (App Router): `(index)/` home, `portfolio/` (grid) + `portfolio/[slug]/` (case study), `about/`, `atelier/`, `contact/`, plus `admin/` (`login/`, `media/`, dashboard `page.tsx`), and `sitemap.ts` / `robots.ts`.
- `src/app/admin/` — `actions.ts` (login/logout), `contentActions.ts` (inline-field + block-layout writes), `mediaActions.ts` (asset CRUD + upload), and the **Media Library** (`media/`, `MediaGallery.tsx`, `MediaUploader.tsx`): lists all Hygraph assets (draft + published) with per-asset publish/rename/delete and a **crop-and-upload** flow (`react-advanced-cropper`). Uploads land as DRAFT; the admin publishes them.
- `src/lib/` — framework-light core:
  - `cms.ts` — `cmsQuery` (public read, `CMS_TOKEN`) / `cmsQueryAuthed` (draft read, mutation token) / `cmsMutate` (write) / `cmsUpload` (Hygraph direct-upload via pre-signed S3 POST). Honors optional `CMS_MUTATION_ENDPOINT`.
  - `getAssets.ts` — Media Library data layer; reads assets at DRAFT stage and derives `status` from `documentInStages`.
  - `session.ts` — pure Web-Crypto HMAC session sign/verify + `checkAdminKey` (dependency-free; no `next/headers`).
  - `auth.ts` — cookie-store helpers (`setSession`/`clearSession`/`isAuthed`); imports `next/headers`, server-only.
  - `images.ts` — `resolveAlt` alt-text fallback helper.
  - `env.ts` — the environment contract, asserted from `next.config.ts` at build time. Errors fail the build; warnings print and continue. `SKIP_ENV_VALIDATION=1` opts out (CI does).
  - `cachedReads.ts` — the visitor-vs-admin read policy and the cache tags.
  - `nextErrors.ts` — identifies Next's control-flow throws (`DYNAMIC_SERVER_USAGE`, `NEXT_REDIRECT`, …) by digest. **Any `catch` around a render-path CMS read must re-throw these** — swallowing one silently strips a route of its dynamic marking.
  - `actionError.ts` — maps thrown errors to safe, actionable messages. Server Actions must never return `e.message` directly: Hygraph errors name internal fields, model names, and token scopes.
  - `rateLimit.ts` — in-memory sliding-window limiter. Per-instance, with the trade-off documented in the module.
  - `uploads.ts` — server-side upload validation by magic bytes, not the client-declared MIME type.
  - `assetRef.ts` — resolves an Asset stored as an id (resume, OG image), so renames and replacements propagate.
  - `ai/` — optional AI page drafting behind a provider-agnostic `PageGenerator` interface. `toBlocks.ts` is the trust boundary: model output maps onto a fixed six-kind vocabulary, image URLs are allowlisted against what the admin supplied, and the result still passes through `sanitizeBlocks`.
- `src/components/` — shared UI: `NavBar/`, `Footer/`, `AdminBar/` (admin-only bottom overlay), `EditableText/` (generic inline scalar/list editor), `AssetPicker/` (image picker reusing Media Library data), `Modal/`, `SiteData/` (the `SiteData` singleton query), `MotionProvider`/`AnimatedSection`, and the **block system** in `blocks/` (see below).

## Content model (Hygraph)

Inline-editable scalar/list fields are whitelisted in `EDITABLE_FIELDS` in [contentActions.ts](src/app/admin/contentActions.ts):

- `Project`: `title`, `description`

Model names are interpolated into the mutation string, so a value is only ever written after it passes this whitelist. Relations are **not** inline-editable.

**Singleton JSON fields** on the one `SiteData` entry hold the rest of the site content, each with a pure sanitize-on-save validator (`src/lib/*.ts`) reused on render and save, and a dedicated server action in [contentActions.ts](src/app/admin/contentActions.ts):

- `home` ([lib/home.ts](src/lib/home.ts)) — homepage hero/archive/explore content + nav cards (`updateHome`)
- `global` ([lib/global.ts](src/lib/global.ts)) — site identity: display name, focus/tagline, email, social handles (normalized by `normalizeHandle`, so a pasted profile URL reduces to a username), plus `navItems` (the header/footer menu, previously hardcoded in two components), `resumeAssetId`, and `ogImageAssetId`. Surfaced in the nav, footer, and contact channels; edited on the admin **Settings** page (`updateGlobal`)
- `seo` ([lib/seo.ts](src/lib/seo.ts)) — title/template, description, keywords, OpenGraph copy, plus a `pages` map of per-route title/description used by each route's own `generateMetadata()` (project pages are excluded on purpose — they derive metadata from their own fields); drives the root layout `generateMetadata()`; edited on the admin **Settings** page (`updateSeo`)
- `atelier`, `about`, `contact` — block layouts (see below)

**Block-layout (JSON) fields** are whitelisted separately in `BLOCK_LAYOUT_FIELDS`: `Project.projectPage` (project case studies) and `SiteData.atelier` / `about` / `contact` (singleton page layouts).

## The block system

`src/components/blocks/` is one reusable block system shared across page types (project pages today, atelier page, more later). See [blocks.ts](src/components/blocks/blocks.ts).

- A page body is an ordered `Block[]` stored in a Hygraph JSON field. **Blocks are named for what they render structurally, never for the domain content** they carry, so the editor/renderer/model stay reusable. Block types: `richText`, `gallery`, `singleImage`, `mediaShowcase`, `comparison`, `beforeAfter` (draggable image wipe), `specs`, `timeline` (ordered process rail), `swatches` (colour or fabric swatches), `documentViewer`, `callout`, `split` (two side-by-side children, no nesting), `entry` (numbered text rail + captioned image grid — the signature atelier layout), `profileHero`, `credentials`, `tagList`, `cta`, `pageIntro`, `columns` (2–4 children, no containers).
- `sanitizeBlocks` is the single validator run on **both render and save** — malformed/unknown blocks are silently dropped (never throws), so a bad layout can't break a page. URLs pass `isSafeUrl`.
- **Rich text** lives only inside blocks (`richText`/`entry` `content`), edited via `richText/RichTextEditor.tsx` (a `contentEditable` surface, no editor deps; converts to/from Hygraph's AST in `richTextAst.ts`). Visitors get the server-rendered `RichTextWidget`. There is no standalone editable rich-text field.
- **Legacy fallback**: projects with no stored `projectPage` are rendered from the old fixed Project schema (`sketches`, `frontFlat`, `techPacks`, etc.) via `projectToBlocks` — the project detail query still fetches those legacy fields.
- **Editing**: `BlockEditor.tsx` (+ `BlockForms.tsx`, `useDragReorder.ts` for pointer-drag reorder) is the admin surface; `BlockSection.tsx`/`ImageGrid.tsx`/`SheetViewer.tsx` render. Persistence goes through `updateBlockLayout(model, id, field, blocks)`.

## Conventions & patterns

- **Inline editing**: wrap a CMS value in `<EditableText model="<Model>" id={entry.id} field="<field>" value={...} editable={isAdmin}>{...}</EditableText>`. Any query feeding an editable field must also fetch the entry `id`. Pass `floatEdit` for headings (keeps the pencil out of flow) and `multiline` for paragraphs.
- **Writes are optimistic**: actions update + publish, but do **not** call `revalidatePath` — the read CDN lags briefly after a write and a refetch would clobber the optimistic UI. Client components hold local state and show the saved value immediately. Don't reintroduce revalidation without accounting for that.
- **Update + publish**: every write goes through `updateAndPublish` (mutate DRAFT, then `publish<Model>`). Asset metadata edits are **stage-aware** (`updateAsset` only re-publishes when the asset was already published, so editing a draft doesn't auto-publish it).
- **Styling**: SCSS modules + CSS custom properties emitted from `src/styles/_themes.scss` into `:root` by `src/styles/global.scss`. **Light theme only** — no `data-theme` / dark-mode toggle. Fonts are loaded via `next/font` (Noto Serif / Inter / DM Mono) and exposed as `--ff-serif|sans|mono`. Match surrounding files.
- **Indexed access is unchecked-safe**: `noUncheckedIndexedAccess` is on, so `list[i]` and `record[key]` are typed `T | undefined` everywhere. Handle it at the read — a named `const` plus a guard, `.at()`, `?? fallback`, or a non-empty tuple type for a literal list. Don't reach for `!`; the point of the flag is that the guard is visible.
- **Edge-safety**: session crypto lives in `session.ts` (Web Crypto only, no `next/headers`) separately from `auth.ts` so it stays portable; keep it that way even though there's no middleware today.

## Common commands

- `npm run dev` — dev server (Next default port 3000).
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — ESLint flat config (`eslint.config.mjs`). Two React Compiler rules are deliberately warnings, with the reasoning in the config.
- `npm run typecheck` — `tsc --noEmit`. `strict` is on.
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Vitest.
- `npm run verify` — typecheck + lint + test. **This is what CI runs**, alongside the build.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all four on every PR. Vercel's own build is a deployment, not a merge gate — it runs no lint, no tests, and arrives after the merge. Run `npm run verify` before pushing.

## Environment / deployment

Server-only env vars (`.env.local` + Vercel): `CMS_ENDPOINT`, `CMS_TOKEN` (public read), `HYGRAPH_MUTATION_TOKEN` (draft read + write), optional `CMS_MUTATION_ENDPOINT`, `ADMIN_KEY` (admin login + session signing), and `WEBSITE_URL` (metadata base / sitemap / OpenGraph). Contact is handled with `mailto:` + social links (no email-sending backend). Deployed on Vercel; `@vercel/speed-insights` is wired in.

`next.config.ts` sets strict security headers (CSP, `X-Frame-Options: DENY`, etc.) and an image `remotePatterns` allowlist (`**.graphassets.com`, plus LinkedIn / Google / Unsplash hosts) — add a host there before referencing its images.

## Cautions / non-obvious behavior

- **Never `catch` a render-path CMS read without `rethrowIfControlFlow`.** Next signals "this route must render dynamically" by *throwing*, so a bare catch eats the signal. This already happened once and only surfaced because the build started logging a failure that was not one.
- **A `"use server"` module may only export async functions.** Exporting a class or a const from one fails the *build* while typecheck and tests stay green — which is why CI runs the build too.

- **Hygraph permissions**: the mutation token needs **Update (Draft) + Publish** on every editable model (`Project` and `SiteData` — the old `AboutPage` / `ContactPage` models were retired when those pages became block layouts on `SiteData`), plus **Create + Read (Draft) + Update (Draft) + Publish + Unpublish + Delete** on `Asset` for the Media Library (deleting a published asset unpublishes it first). A "permission errors" message means the token scope is missing, not a code bug.
- **Mutation endpoint**: if `CMS_ENDPOINT` is the read CDN (`*.cdn.hygraph.com`), writes may be rejected — set `CMS_MUTATION_ENDPOINT` to the regular Content API host.
- **Asset rename** writes a custom `title` field on the Asset model (Hygraph won't edit `fileName` in place); the UI falls back to the filename minus extension when `title` is empty.
- **Upload ingestion** is async: `uploadAsset` polls `getAssetById` until `size` populates (bounded) so the new asset renders immediately.
- **No middleware**: never assume `/admin` is protected by a proxy — add `isAuthed()`/`redirect` to any new admin page, and re-verify in any new Server Action.

## Observability

[observability.ts](src/lib/observability.ts) emits one JSON object per line, so Vercel's log viewer and any drain can filter on `event`, `level`, `scope`, and `action` rather than grepping prose.

- `reportError({ scope, context, error, correlationId })` — every error boundary and every Server Action catch goes through this. The `correlationId` is the same reference shown to the admin in the UI, so a support question maps to a log line.
- `auditEvent({ action, model, entryId, outcome, client })` — content mutations, asset deletion, project deletion, and login attempts. **Field names only, never values**: values are the content itself, and logging them would put whole page bodies into the log stream.

There is no Sentry dependency, deliberately — that is an account, a config file, and a build plugin, which is a decision for whoever maintains this rather than for the change that noticed the gap. `setErrorReporter` is the seam; wiring an SDK later is one call in `instrumentation.ts` with every call site already in place.

Authentication is a single shared key, so the audit trail records **what** changed and **from where**, not **who**. Distinguishing people needs per-user credentials.

## Testing

Vitest, ~515 tests, colocated as `*.test.ts` beside the module. `vitest.config.mts` mirrors the tsconfig aliases and stubs `server-only` (Next aliases that package away itself, so Vitest cannot resolve it).

What is tested, and why those things:

- **`session.ts`** — the whole authorization boundary, and 49 dependency-free lines.
- **The sanitizers** (`blocks.ts`, `global.ts`, `seo.ts`, `home.ts`, `portfolio.ts`) — they run on both render and save, so a gap is a gap in two places. The contract is *never throws, silently drops garbage*; the suites sweep hostile input rather than only checking happy paths.
- **`richTextAst.ts`** — round-trip fidelity. A lossy conversion corrupts published prose invisibly.
- **`ai/toBlocks.ts`** — the model-output trust boundary.

Untested by design: `cms.ts`, `getAssets.ts`, and the React components, which need network or DOM mocking heavy enough to test the mocks rather than the code. Prefer an end-to-end test for those.

Because `noUncheckedIndexedAccess` applies to test files too, `src/test/at.ts` provides `at(list, i)`, `only(list)`, and `prop(record, key)`. Use those rather than `list[0]?.field`: optional chaining turns "the list was empty" into "expected undefined to be 'Flats'", while these throw naming the real problem, and they hand back a definite value that narrowing sticks to.

When adding a validator or a pure helper, add its suite in the same commit — that is the established pattern here, and the reason these modules are pure in the first place.

## Extending the project

- **New inline-editable field**: add it to the model's entry in `EDITABLE_FIELDS`, fetch the entry `id` in the query, wrap the value in `EditableText`.
- **New block type**: add it to the `Block` union, `BLOCK_TYPES`/labels/descriptions, `createEmptyBlock`, `cleanBlock` (sanitizer), `blockSummary`/`blockHasData`, plus a renderer in `BlockSection` and a form in `BlockForms`.
- **New block-layout page**: add a JSON field to the model, whitelist it in `BLOCK_LAYOUT_FIELDS`, fetch the `id` + field, and render with the block renderer / edit with `BlockEditor`.

## Maintaining this document

Update `AGENTS.md` when a change affects how an agent should reason about the project — not for routine content/styling tweaks. Triggers:

- Architecture or rendering-strategy changes (caching/ISR, new runtime constraints, adding middleware).
- New subsystems, routes, or shared modules in `src/lib` / `src/components`.
- Changes to the auth/admin model, the Server-Action write boundary, or the optimistic-update approach.
- New or changed editable models/fields or block types.
- New env vars, deployment target, or CMS/provider changes.
- New conventions, or commands/tooling changes (build, typecheck, lint).

Keep it concise and link to source files rather than duplicating implementation detail.
