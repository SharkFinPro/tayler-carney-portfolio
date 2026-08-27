# AGENTS.md

Onboarding + decision-making reference for AI agents working in this repo. Keep it concise; link out rather than duplicating. See [README.md](README.md) for human build instructions.

## What this is

`tayler-carney-portfolio` is Tayler Carney's personal portfolio — a structural-fashion-design site with an editorial, technical-blueprint aesthetic. It's a **Next.js 16 (App Router) + React 19 + TypeScript** app, styled with **SCSS modules**, content sourced from **Hygraph (GraphCMS)**, deployed on **Vercel**. There is **no database** — all content lives in Hygraph.

The site has a lightweight, **database-free admin editor**: log in with an env-var key at `/admin/login`, then edit most content *inline on the page it lives on* (titles/descriptions via a pencil affordance, page bodies via a block editor). Visitors see zero change.

## Architecture at a glance

- **Rendering**: Server Components by default. Routes are dynamic because every page calls `isAuthed()` (reading cookies) to decide whether to render edit affordances — but reads are **cached at the fetch layer**, which is where the win is. See [cachedReads.ts](src/lib/cachedReads.ts): visitors read through a 60s tagged cache, **admins always read fresh** so the editor never loads stale content it might then save back over. Writes still do not call `revalidateTag` — the read-CDN lag would clobber optimistic UI, which is the original reason and still holds. `getSiteData` and `getProject` are wrapped in React `cache()` for per-request dedupe. Interactive bits are small `"use client"` islands; page-entry animations use Framer Motion (`MotionProvider`, `AnimatedSection`).
- **Data flow**: pages `POST` GraphQL to `process.env.CMS_ENDPOINT`. Public reads attach a read token (`CMS_TOKEN`); writes go through Server Actions using a secret mutation token — never the client.
- **Admin mode**: a single signed, httpOnly cookie. Each server page reads it via `isAuthed()` and threads an `isAdmin` boolean into its client islands; when true, inline edit controls render.
- **Auth boundary**: middleware exists, but it only attaches the CSP — it does **not** proxy or gate anything. Admin pages (`/admin`, `/admin/media`) guard themselves with `if (!(await isAuthed())) redirect("/admin/login")`. **The real authorization boundary is the Server Action** — every write re-verifies the session via `requireAuth`, which now lives in [auth.ts](src/lib/auth.ts) rather than as three private copies. Login is rate-limited and every attempt is logged; see [rateLimit.ts](src/lib/rateLimit.ts).

## Key directories & modules

- `src/app/` — routes (App Router): `(index)/` home, `portfolio/` (grid) + `portfolio/[slug]/` (case study), `about/`, `atelier/`, `contact/`, plus `admin/` (`login/`, `media/`, dashboard `page.tsx`), and `sitemap.ts` / `robots.ts`.
- `src/app/admin/` — `actions.ts` (login/logout), `contentActions.ts` (inline-field + block-layout writes), `mediaActions.ts` (asset CRUD + upload), and the **Media Library** (`media/`, `MediaGallery.tsx`, `MediaUploader.tsx`): lists all Hygraph assets (draft + published) with per-asset publish/rename/delete and a **crop-and-upload** flow (`react-advanced-cropper`). Uploads land as DRAFT; the admin publishes them.
- `src/lib/` — framework-light core:
  - `cms.ts` — `cmsQuery` (public read, `CMS_TOKEN`) / `cmsQueryAuthed` (draft read, mutation token) / `cmsMutate` (write) / `cmsUpload` (Hygraph direct-upload via pre-signed S3 POST). Honors optional `CMS_MUTATION_ENDPOINT`.
  - `getAssets.ts` — Media Library data layer; reads assets at DRAFT stage and derives `status` from `documentInStages`.
  - `session.ts` — pure Web-Crypto HMAC session sign/verify + `checkAdminKey` (dependency-free; no `next/headers`).
  - `csp.ts` — the Content Security Policy, built per request around a fresh nonce. Web Crypto only, because it runs in middleware on the Edge runtime.
  - `auth.ts` — cookie-store helpers (`setSession`/`clearSession`/`isAuthed`); imports `next/headers`, server-only.
  - `images.ts` — `resolveAlt` alt-text fallback helper.
  - `env.ts` — the environment contract, asserted from `next.config.ts` at build time. Errors fail the build; warnings print and continue. `SKIP_ENV_VALIDATION=1` opts out (CI does).
  - `cachedReads.ts` — the visitor-vs-admin read policy and the cache tags.
  - `nextErrors.ts` — identifies Next's control-flow throws (`DYNAMIC_SERVER_USAGE`, `NEXT_REDIRECT`, …) by digest. **Any `catch` around a render-path CMS read must re-throw these** — swallowing one silently strips a route of its dynamic marking.
  - `actionError.ts` — maps thrown errors to safe, actionable messages. Server Actions must never return `e.message` directly: Hygraph errors name internal fields, model names, and token scopes.
  - `rateLimit.ts` — in-memory sliding-window limiter. Per-instance, with the trade-off documented in the module.
  - `uploads.ts` — server-side upload validation by magic bytes, not the client-declared MIME type.
  - `assetRef.ts` — resolves an Asset stored as an id (resume, OG image), so renames and replacements propagate.
  - `ai/` — the optional AI features, behind two provider-agnostic interfaces in `types.ts`: `PageGenerator` (draft a page) and `ImageDescriber` (write alt text). `gemini.ts` is the only file in the app that imports an AI SDK — that boundary is why replacing the previous provider was one file written and one deleted. Each feature is configured with an **ordered chain of models, not one model**: `acrossModels` tries them in turn, moving on when a model says it will not serve (429 quota, 404 retired, or a 503 that outlived `withRetry`) and stopping dead on anything else, since a 400 or a safety refusal fails identically everywhere and walking the chain would only bury the cause. Free-tier quota is per-model per-day, so this is the difference between drafting working and not. `GEMINI_PAGE_MODEL` / `GEMINI_ALT_TEXT_MODEL` override the chains and are comma-separated; a single name pins one model and disables the fallback. `GenerationResult.model` reports which one actually answered. Prompts and the response schema live in `prompts.ts` rather than in the provider, so swapping it again does not mean copying them. `fetchImage.ts` does the outbound image fetch: Gemini takes bytes inline rather than fetching a URL, and this is where the host allowlist, the size cap, the timeout and the sharp downscale live, so a second provider does not reimplement them. **There is no limit on how many images a draft may use** — `fetchImagesWithinBudget` bounds the request by base64 bytes instead, fetching in bounded parallel and stopping once full, and `modelImageEdge` shrinks each image as the batch grows so a large set fits; what did not fit comes back as `GenerationResult.unseen`. **Every selected image reaches the draft regardless**: the model references images by `img-N` token rather than by URL (it will mistype an opaque asset URL, and each mistype used to be an image silently missing), and `toBlocks` appends anything the draft did not place into a trailing gallery. `houseStyle.ts` outlines the existing project pages — kind, heading and image count per section, never their prose — and the brief shows them so a draft matches the site's own section rhythm and heading register instead of inventing one. Each feature has a trust boundary module that assumes the model got it wrong: `toBlocks.ts` maps drafted output onto a fixed six-kind vocabulary, allowlists image URLs against what the admin supplied, and still runs the result through `sanitizeBlocks`; `altText.ts` strips the wrappers and redundant openers models put around alt text, caps its length, and holds the host allowlist for which images may be sent out at all. **Neither feature writes anything** — both hand their output to the admin to accept.
- `src/components/` — shared UI: `NavBar/`, `Footer/`, `AdminBar/` (admin-only bottom overlay), `EditableText/` (generic inline scalar/list editor), `AssetPicker/` (image picker reusing Media Library data; single-select by default, or `multiple` for a set — the two are a props union, so a call site cannot mix them up), `Modal/`, `SiteData/` (the `SiteData` singleton query), `MotionProvider`/`AnimatedSection`, and the **block system** in `blocks/` (see below).

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
- **Update + publish**: every content write funnels through `updateDraft` (mutate DRAFT) in [contentActions.ts](src/app/admin/contentActions.ts), and publishing is the separate `publishEntry` step — split so the admin can save a draft without shipping it. There is no transaction across the two, which is what `PublishFailedError` exists to report. Asset metadata edits are **stage-aware** (`updateAsset` only re-publishes when the asset was already published, so editing a draft doesn't auto-publish it).
- **Styling**: SCSS modules + CSS custom properties emitted from `src/styles/_themes.scss` into `:root` by `src/styles/global.scss`. **Light theme only** — no `data-theme` / dark-mode toggle. Fonts are loaded via `next/font` (Noto Serif / Inter / DM Mono) and exposed as `--ff-serif|sans|mono`. Match surrounding files.
- **Accessibility is linted**: the full `jsx-a11y` recommended set runs in `npm run lint` (not just the six rules Next enables). A violation is a lint error, so it fails CI. The three disables in the tree are each for a pointer convenience that duplicates an existing keyboard control, and each says which one — match that bar before adding a fourth.
- **Indexed access is unchecked-safe**: `noUncheckedIndexedAccess` is on, so `list[i]` and `record[key]` are typed `T | undefined` everywhere. Handle it at the read — a named `const` plus a guard, `.at()`, `?? fallback`, or a non-empty tuple type for a literal list. Don't reach for `!`; the point of the flag is that the guard is visible.
- **Edge-safety**: session crypto lives in `session.ts` (Web Crypto only, no `next/headers`) separately from `auth.ts` so it stays portable. `csp.ts` follows the same rule for the same reason, and now actually runs there — middleware is Edge runtime, where `node:crypto` and `Buffer` are not a safe assumption.

## Common commands

- `npm run dev` — dev server (Next default port 3000).
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — ESLint flat config (`eslint.config.mjs`). Two React Compiler rules are deliberately warnings, with the reasoning in the config.
- `npm run typecheck` — `tsc --noEmit`. `strict` is on.
- `npm test` / `npm run test:watch` / `npm run test:coverage` — Vitest.
- `npm run verify` — typecheck + lint + test-with-coverage. **This is what CI runs**, alongside the build.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all four on every PR, on Node 22 (what Vercel runs) and Node 24 (what it will run next). Every check runs even when an earlier one fails, so one push reports every problem at once. A second `determinism` job re-runs the suite in randomized order and under `TZ=Pacific/Kiritimati`, which is where order-dependence and unpinned date handling show up. Vercel's own build is a deployment, not a merge gate — it runs no lint, no tests, and arrives after the merge. Run `npm run verify` before pushing.

## Environment / deployment

Server-only env vars (`.env.local` + Vercel): `CMS_ENDPOINT`, `CMS_TOKEN` (public read), `HYGRAPH_MUTATION_TOKEN` (draft read + write), optional `CMS_MUTATION_ENDPOINT`, `ADMIN_KEY` (admin login + session signing), and `WEBSITE_URL` (metadata base / sitemap / OpenGraph). Contact is handled with `mailto:` + social links (no email-sending backend). Deployed on Vercel; `@vercel/speed-insights` is wired in.

`next.config.ts` sets the static security headers (`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `nosniff`) and an image `remotePatterns` allowlist (`**.graphassets.com`, plus LinkedIn / Google / Unsplash hosts) — add a host there before referencing its images.

## Cautions / non-obvious behavior

- **Never `catch` a render-path CMS read without `rethrowIfControlFlow`.** Next signals "this route must render dynamically" by *throwing*, so a bare catch eats the signal. This already happened once and only surfaced because the build started logging a failure that was not one.
- **A `"use server"` module may only export async functions.** Exporting a class or a const from one fails the *build* while typecheck and tests stay green — which is why CI runs the build too.

- **Hygraph permissions**: the mutation token needs **Read (Draft) + Update (Draft) + Publish** on every editable model (`Project` and `SiteData` — the old `AboutPage` / `ContactPage` models were retired when those pages became block layouts on `SiteData`), plus **Create + Read (Draft) + Update (Draft) + Publish + Unpublish + Delete** on `Asset` for the Media Library (deleting a published asset unpublishes it first), and **Unpublish + Delete** on `Project` for the archived drawer's permanent delete (which unpublishes before deleting). A "permission errors" message means the token scope is missing, not a code bug.

  `Read (Draft)` on `Project` is easy to leave out because it is a *read* on a token named for mutations, but the admin surface depends on it in four places: `cachedReads` serves admins the draft stage, `aiActions` loads draft layouts as house-style examples, `mediaActions` scans draft layouts for asset usage, and `createProject` checks a new slug against draft entries. Without it those degrade quietly rather than erroring — an editor sees stale content and duplicate slugs become creatable.
- **Mutation endpoint**: if `CMS_ENDPOINT` is the read CDN (`*.cdn.hygraph.com`), writes may be rejected — set `CMS_MUTATION_ENDPOINT` to the regular Content API host.
- **Asset rename** writes a custom `title` field on the Asset model (Hygraph won't edit `fileName` in place); the UI falls back to the filename minus extension when `title` is empty.
- **Upload ingestion** is async: `uploadAsset` polls `getAssetById` until `size` populates (bounded) so the new asset renders immediately.
- **Middleware sets the CSP and nothing else.** Never assume `/admin` is protected by a proxy: middleware does not check authorization, so every new admin page still needs its own `isAuthed()`/`redirect`, and every new Server Action still has to re-verify.
- **`script-src` has no `'unsafe-inline'`.** Inline `<script>` and `onclick="…"` attributes will not run. Next stamps its own inline scripts with the request nonce automatically, which covers everything the framework emits — but hand-written inline script needs the nonce from the `x-nonce` request header, and inline event-handler attributes cannot be made to work at all. Use a client component.
- **Two `Content-Security-Policy` headers are enforced together, not overridden.** That is why `next.config.ts` no longer sets one; adding a second copy there would intersect with the nonce policy rather than replace it.

## Observability

[observability.ts](src/lib/observability.ts) emits one JSON object per line, so Vercel's log viewer and any drain can filter on `event`, `level`, `scope`, and `action` rather than grepping prose.

- `reportError({ scope, context, error, correlationId })` — every error boundary and every Server Action catch goes through this. The `correlationId` is the same reference shown to the admin in the UI, so a support question maps to a log line.
- `auditEvent({ action, model, entryId, outcome, client })` — content mutations, asset deletion, project deletion, and login attempts. **Field names only, never values**: values are the content itself, and logging them would put whole page bodies into the log stream.

There is no Sentry dependency, deliberately — that is an account, a config file, and a build plugin, which is a decision for whoever maintains this rather than for the change that noticed the gap. `setErrorReporter` is the seam; wiring an SDK later is one call in `instrumentation.ts` with every call site already in place.

Authentication is a single shared key, so the audit trail records **what** changed and **from where**, not **who**. Distinguishing people needs per-user credentials.

## Testing

Vitest, colocated as `*.test.ts` beside the module. (No count here on purpose — a number in a document is a fact that goes stale on the next PR.) `vitest.config.mts` mirrors the tsconfig aliases and stubs `server-only` (Next aliases that package away itself, so Vitest cannot resolve it).

What is tested, and why those things:

- **`session.ts`** — the whole authorization boundary, and 49 dependency-free lines.
- **The sanitizers** (`blocks.ts`, `global.ts`, `seo.ts`, `home.ts`, `portfolio.ts`) — they run on both render and save, so a gap is a gap in two places. The contract is *never throws, silently drops garbage*; the suites sweep hostile input rather than only checking happy paths.
- **`richTextAst.ts`** — round-trip fidelity. A lossy conversion corrupts published prose invisibly.
- **`ai/toBlocks.ts`** — the model-output trust boundary, and the guarantee that every selected image lands on the page.
- **`ai/houseStyle.ts`** — reads layouts other code wrote; a malformed one must cost its own example, not the draft.
- **`contentActions.ts`** — the content write boundary. `model` is interpolated straight into the mutation string, so the two field whitelists are the only thing between a caller-supplied string and a GraphQL document; the suite also pins that authorization is checked before any CMS call, that every payload is sanitized before it is written, that a raw Hygraph message never reaches the browser, and that the audit trail records field names and never values.
- **`portfolioActions.ts`** — two rules that are invisible in review. A reorder must never publish: `portfolio` shares the SiteData singleton with home, about, atelier, contact, global and seo, and Hygraph publishes an *entry* rather than a field, so publishing here would ship every other pending draft on the site. And the app's only permanent delete unpublishes first, tolerating that step failing, because a project that was never published is an ordinary case rather than an error.
- **`mediaActions.ts`** — the upload gate above all. The client-declared MIME type is forgeable, so the real leading bytes decide what may be stored, and `next.config.ts` sets `dangerouslyAllowSVG`, which makes a stored SVG dangerous rather than merely unsupported. `@/lib/uploads` is deliberately *not* mocked in that suite: asserting the validator against a stub of itself would prove nothing. Also pinned: that the stored filename's extension follows the sniffed bytes rather than the claim, that editing metadata never silently publishes a draft-only asset, and that the usage warning matches URLs exactly rather than by substring.
- **`aiActions.ts`** — every guard here sits in front of a call that costs money, so a guard that stops guarding shows up as a bill rather than as a bug. Pinned: the per-action budgets (with the real limiter, not a stub — a stubbed limiter asserts only that a stub was called), the bounds applied before anything is sent, and the host allowlist on image URLs. That last one matters because this process *fetches* those URLs, and the source is explicit that "starts with `https://`" is not a host check.
- **`ai/index.ts`** — that an unconfigured install is a working install. With no key the getters return null, the actions report the feature unavailable, and the UI hides its entry points; that is a contract with three call sites whose failure mode is a broken button on a site whose owner never asked for AI. Also the model-chain parser, where a typo in an optional env var must fall back to the provider's defaults rather than throw.
- **`actions.ts`** (login/logout) — the admin surface is one shared secret, so this is where guessing it is made expensive, and none of it is visible in a working app. Pinned with the real limiter: the five-per-client budget, the deliberate delay on failures, that a success clears the client's budget but not the shared one, and that a rate-limited answer is identical whether the key was right or wrong — a throttle that only fired for wrong keys would itself confirm a right one. Also the tiered order: the backstop is consulted only for requests that already passed the per-client check, because the other order lets one attacker who has burned their own budget drain the shared one and lock out the real admin.
- **`auth.ts`** — the session cookie's attributes. `session.ts` covers the crypto; this covers the cookie the signed token goes into, where `httpOnly`, `sameSite: strict`, and `secure` (conditional on production, so localhost still works) are the whole difference between a session script cannot read and one it can.
- **`projectToBlocks`** in `blocks.ts` — the fallback that renders any project whose `projectPage` was never authored, so it is the difference between an old project rendering and rendering blank. The section order is pinned because it *is* the page; so is the rule that an absent section produces no block rather than an empty heading, and that an unsafe image URL is dropped on this path exactly as the sanitizer drops it on the other.
- **`sitemap.ts` / `robots.ts`** — documents written for crawlers rather than readers, so nothing in them fails visibly. Pinned: that the admin surface is disallowed as both a path and a subtree, that the sitemap query asks for *no* stage (an admin's DRAFT view must never reach search engines), that archived projects are excluded because they 404, and that an unusable `WEBSITE_URL` makes robots omit the sitemap directive rather than emit an invalid relative one. Both share `siteUrl.ts` so the URL robots advertises is the one sitemap actually serves.
- **`useUnsavedChanges.ts`** — twenty lines standing between an admin mid-edit and a closed tab, and both failure directions are silent. A listener that stops being registered loses a draft with no error anywhere; one that stops being removed warns on a clean page, which trains the person to click through the dialog — and then it does not protect them the time it matters.
- **`middleware.ts`** — that the policy is *attached*, not just built. csp.ts proves the string is right; this proves it reaches the response, that the nonce reaches the request (via Next's `x-middleware-request-*` override channel), and that the two carry the same value. If they ever drift, every inline script Next emits is blocked and the site renders blank — with both halves still looking correct in isolation.
- **`a11y.ts`** — that Enter and Space actually activate, and that the browser default is suppressed. The jsx-a11y rules can see the props are present; they cannot see that pressing Space works and doesn't also scroll the page.
- **`assetRef.ts`** — the naming fallback chain (a string visitors read) and, more importantly, that a caught error is offered to `rethrowIfControlFlow` before being swallowed. This runs in the root layout and the metadata generator, which is exactly where eating that signal costs a route its dynamic rendering.
- **`resume.ts`** — three lines of delegation, tested for the one part that isn't plumbing: the `"Resume"` fallback label, which is what a visitor sees on the link when the asset has neither a Media Library title nor a usable filename.

Untested by design: `cms.ts`, `getAssets.ts`, and most React components, which need network or DOM mocking heavy enough to test the mocks rather than the code. Prefer an end-to-end test for those.

Nothing is currently in a third category. There used to be a list here of modules that were untested by omission rather than by decision — the Server Actions, the middleware, the legacy project fallback, the SEO documents — and it is empty now. If you add a module and do not test it, add it back rather than leaving the reader to infer that everything is covered.

The exception is `SuggestAltButton`, whose entire surface is two Server Action calls — one `vi.mock` of that module, and the properties under test are ones review cannot see: that an unconfigured install renders no button at all, that availability is asked for once rather than once per gallery card, and that a failed suggestion never reaches the field. Note that `cleanup()` has to be called in `afterEach` by hand: Testing Library only registers auto-cleanup when Vitest globals are on, and they are not.

**Coverage is gated.** `vitest.config.mts` sets global floors just under the current numbers, so a change that lowers coverage fails the PR that lowers it; `npm run verify` and CI both run `test:coverage` for that reason. The denominator is every `.ts` module that holds logic — `src/lib`, `src/app` (including the Server Actions), `src/components` hooks, and `src/middleware.ts` — not only the directories the suite already reaches, because a denominator that grows with the tests can never report a regression. `.tsx` is excluded on the same reasoning as “untested by design” above: components are an end-to-end concern, and counting them would swamp the number with markup nothing here claims to test. The modules named as untested by design *are* in the denominator and do drag it down — that is the honest reading, and the floors are set where they actually are rather than where it would be flattering.

On top of the global floor, two glob entries hold the modules where a 60% floor is far too loose to notice a regression: the four validators that run on both render and save (`global`, `home`, `seo`, `portfolio`) are pinned at 100% statements/lines/functions, and `session.ts` — the authorization boundary — is pinned at 100% lines. These are *additional* checks, not carve-outs: Vitest builds the global set from every file "even if they are included by glob patterns", so the headline number still covers the whole codebase. Note v8's `statements` and `lines` genuinely disagree on `session.ts` (96% vs 100%), which is why its statement floor is the lower number rather than a typo.

Raise the floors as gaps close. There is deliberately no `autoUpdate`: a threshold that rewrites itself records nothing.

Because `noUncheckedIndexedAccess` applies to test files too, `src/test/at.ts` provides `at(list, i)`, `only(list)`, and `prop(record, key)`. Use those rather than `list[0]?.field`: optional chaining turns "the list was empty" into "expected undefined to be 'Flats'", while these throw naming the real problem, and they hand back a definite value that narrowing sticks to.

When adding a validator or a pure helper, add its suite in the same commit — that is the established pattern here, and the reason these modules are pure in the first place.

## Extending the project

- **New inline-editable field**: add it to the model's entry in `EDITABLE_FIELDS`, fetch the entry `id` in the query, wrap the value in `EditableText`.
- **New block type**: add it to the `Block` union, `BLOCK_TYPES`/labels/descriptions, `BLOCK_SHOW_COUNT`, `DEFAULT_HEADINGS`, `createEmptyBlock`, `cleanBlock` (sanitizer), `blockSummary`/`blockHasData`, plus a renderer in `BlockSection` and a form in `BlockForms`. The `Record<BlockType, …>` maps make the compiler name most of these for you; the switches are exhaustive, so it names the rest.
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
