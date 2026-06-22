# AGENTS.md

Onboarding + decision-making reference for AI agents working in this repo. Keep it concise; link out rather than duplicating. See [README.md](README.md) for human build instructions.

## What this is

`tayler-carney-portfolio` is Tayler Carney's personal portfolio — a structural-fashion-design site with an editorial, technical-blueprint aesthetic. It's a **Next.js 16 (App Router) + React 19 + TypeScript** app, styled with **SCSS modules**, content sourced from **Hygraph (GraphCMS)**, deployed on **Vercel**. There is **no database** — all content lives in Hygraph.

The site has a lightweight, **database-free admin editor**: log in with an env-var key at `/admin/login`, then edit most content *inline on the page it lives on* (titles/descriptions via a pencil affordance, page bodies via a block editor). Visitors see zero change.

## Architecture at a glance

- **Rendering**: Server Components by default. CMS-backed pages set `export const dynamic = "force-dynamic"` (fresh per request, no caching to invalidate). Interactive bits are small `"use client"` islands; page-entry animations use Framer Motion (`MotionProvider`, `AnimatedSection`).
- **Data flow**: pages `POST` GraphQL to `process.env.CMS_ENDPOINT`. Public reads attach a read token (`CMS_TOKEN`); writes go through Server Actions using a secret mutation token — never the client.
- **Admin mode**: a single signed, httpOnly cookie. Each server page reads it via `isAuthed()` and threads an `isAdmin` boolean into its client islands; when true, inline edit controls render.
- **Auth boundary**: there is **no middleware/proxy**. Admin pages (`/admin`, `/admin/media`) guard themselves with `if (!(await isAuthed())) redirect("/admin/login")`. **The real authorization boundary is the Server Action** — every write re-verifies the session (`requireAuth`) before mutating.

## Key directories & modules

- `src/app/` — routes (App Router): `(index)/` home, `portfolio/` (grid) + `portfolio/[slug]/` (case study), `about/`, `atelier/`, `contact/`, plus `admin/` (`login/`, `media/`, dashboard `page.tsx`), and `sitemap.ts` / `robots.ts`.
- `src/app/admin/` — `actions.ts` (login/logout), `contentActions.ts` (inline-field + block-layout writes), `mediaActions.ts` (asset CRUD + upload), and the **Media Library** (`media/`, `MediaGallery.tsx`, `MediaUploader.tsx`): lists all Hygraph assets (draft + published) with per-asset publish/rename/delete and a **crop-and-upload** flow (`react-advanced-cropper`). Uploads land as DRAFT; the admin publishes them.
- `src/lib/` — framework-light core:
  - `cms.ts` — `cmsQuery` (public read, `CMS_TOKEN`) / `cmsQueryAuthed` (draft read, mutation token) / `cmsMutate` (write) / `cmsUpload` (Hygraph direct-upload via pre-signed S3 POST). Honors optional `CMS_MUTATION_ENDPOINT`.
  - `getAssets.ts` — Media Library data layer; reads assets at DRAFT stage and derives `status` from `documentInStages`.
  - `session.ts` — pure Web-Crypto HMAC session sign/verify + `checkAdminKey` (dependency-free; no `next/headers`).
  - `auth.ts` — cookie-store helpers (`setSession`/`clearSession`/`isAuthed`); imports `next/headers`, server-only.
  - `images.ts` — `resolveAlt` alt-text fallback helper.
- `src/components/` — shared UI: `NavBar/`, `Footer/`, `AdminBar/` (admin-only bottom overlay), `EditableText/` (generic inline scalar/list editor), `AssetPicker/` (image picker reusing Media Library data), `Modal/`, `SiteData/` (the `SiteData` singleton query), `MotionProvider`/`AnimatedSection`, and the **block system** in `blocks/` (see below).

## Content model (Hygraph)

Inline-editable scalar/list fields are whitelisted in `EDITABLE_FIELDS` in [contentActions.ts](src/app/admin/contentActions.ts):

- `Project`: `title`, `description`
- `AboutPage`: `title`, `subtitle`
- `ContactPage`: `header`, `subheader`, `availabilityMessage`
- `SiteData`: `displayName`, `focus`, `email`, `linkedInHandle`, `instagramHandle` (singleton — name/contact/socials)

Model names are interpolated into the mutation string, so a value is only ever written after it passes this whitelist. Relations are **not** inline-editable. There is no `SiteConfig` entry and no site-wide toggles/featured/ordering — the **home page is hardcoded** (`pageData` in [page.tsx](src/app/(index)/page.tsx)), not CMS-driven.

**Block-layout (JSON) fields** are whitelisted separately in `BLOCK_LAYOUT_FIELDS`: `Project.projectPage` (project case studies) and `SiteData.atelier` (the singleton Atelier page).

## The block system

`src/components/blocks/` is one reusable block system shared across page types (project pages today, atelier page, more later). See [blocks.ts](src/components/blocks/blocks.ts).

- A page body is an ordered `Block[]` stored in a Hygraph JSON field. **Blocks are named for what they render structurally, never for the domain content** they carry, so the editor/renderer/model stay reusable. Block types: `richText`, `gallery`, `singleImage`, `mediaShowcase`, `comparison`, `specs`, `documentViewer`, `callout`, `split` (two side-by-side children, no nesting), `entry` (numbered text rail + captioned image grid — the signature atelier layout).
- `sanitizeBlocks` is the single validator run on **both render and save** — malformed/unknown blocks are silently dropped (never throws), so a bad layout can't break a page. URLs pass `isSafeUrl`.
- **Rich text** lives only inside blocks (`richText`/`entry` `content`), edited via `richText/RichTextEditor.tsx` (a `contentEditable` surface, no editor deps; converts to/from Hygraph's AST in `richTextAst.ts`). Visitors get the server-rendered `RichTextWidget`. There is no standalone editable rich-text field.
- **Legacy fallback**: projects with no stored `projectPage` are rendered from the old fixed Project schema (`sketches`, `frontFlat`, `techPacks`, etc.) via `projectToBlocks` — the project detail query still fetches those legacy fields.
- **Editing**: `BlockEditor.tsx` (+ `BlockForms.tsx`, `useDragReorder.ts` for pointer-drag reorder) is the admin surface; `BlockSection.tsx`/`ImageGrid.tsx`/`SheetViewer.tsx` render. Persistence goes through `updateBlockLayout(model, id, field, blocks)`.

## Conventions & patterns

- **Inline editing**: wrap a CMS value in `<EditableText model="<Model>" id={entry.id} field="<field>" value={...} editable={isAdmin}>{...}</EditableText>`. Any query feeding an editable field must also fetch the entry `id`. Pass `floatEdit` for headings (keeps the pencil out of flow) and `multiline` for paragraphs.
- **Writes are optimistic**: actions update + publish, but do **not** call `revalidatePath` — the read CDN lags briefly after a write and a refetch would clobber the optimistic UI. Client components hold local state and show the saved value immediately. Don't reintroduce revalidation without accounting for that.
- **Update + publish**: every write goes through `updateAndPublish` (mutate DRAFT, then `publish<Model>`). Asset metadata edits are **stage-aware** (`updateAsset` only re-publishes when the asset was already published, so editing a draft doesn't auto-publish it).
- **Styling**: SCSS modules + CSS custom properties emitted from `src/styles/_themes.scss` into `:root` by `src/styles/global.scss`. **Light theme only** — no `data-theme` / dark-mode toggle. Fonts are loaded via `next/font` (Noto Serif / Inter / DM Mono) and exposed as `--ff-serif|sans|mono`. Match surrounding files.
- **Edge-safety**: session crypto lives in `session.ts` (Web Crypto only, no `next/headers`) separately from `auth.ts` so it stays portable; keep it that way even though there's no middleware today.

## Common commands

- `npm run dev` — dev server (Next default port 3000).
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — `eslint .` (flat config, `eslint-config-next`).
- Typecheck: `npx tsc --noEmit`.

## Environment / deployment

Server-only env vars (`.env.local` + Vercel): `CMS_ENDPOINT`, `CMS_TOKEN` (public read), `HYGRAPH_MUTATION_TOKEN` (draft read + write), optional `CMS_MUTATION_ENDPOINT`, `ADMIN_KEY` (admin login + session signing), and `WEBSITE_URL` (metadata base / sitemap / OpenGraph). Contact is handled with `mailto:` + social links (no email-sending backend). Deployed on Vercel; `@vercel/speed-insights` is wired in.

`next.config.ts` sets strict security headers (CSP, `X-Frame-Options: DENY`, etc.) and an image `remotePatterns` allowlist (`**.graphassets.com`, plus LinkedIn / Google / Unsplash hosts) — add a host there before referencing its images.

## Cautions / non-obvious behavior

- **Hygraph permissions**: the mutation token needs **Update (Draft) + Publish** on every editable model (`Project`, `AboutPage`, `ContactPage`, `SiteData`), plus **Create + Read (Draft) + Update (Draft) + Publish + Unpublish + Delete** on `Asset` for the Media Library (deleting a published asset unpublishes it first). A "permission errors" message means the token scope is missing, not a code bug.
- **Mutation endpoint**: if `CMS_ENDPOINT` is the read CDN (`*.cdn.hygraph.com`), writes may be rejected — set `CMS_MUTATION_ENDPOINT` to the regular Content API host.
- **Asset rename** writes a custom `title` field on the Asset model (Hygraph won't edit `fileName` in place); the UI falls back to the filename minus extension when `title` is empty.
- **Upload ingestion** is async: `uploadAsset` polls `getAssetById` until `size` populates (bounded) so the new asset renders immediately.
- **No middleware**: never assume `/admin` is protected by a proxy — add `isAuthed()`/`redirect` to any new admin page, and re-verify in any new Server Action.

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
