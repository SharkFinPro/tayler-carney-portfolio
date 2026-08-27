<div align="center">
  <h1>Tayler Carney — Portfolio</h1>

  <p>A personal portfolio for a structural fashion designer, with an editorial, technical-blueprint aesthetic and a database-free inline content editor.</p>

  <p>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white">
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white">
    <img alt="Hygraph" src="https://img.shields.io/badge/CMS-Hygraph-000000">
    <img alt="Vercel" src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white">
  </p>
</div>

---

## Project Overview

Tayler Carney's portfolio is a [Next.js](https://nextjs.org/) (App Router) website that showcases a structural fashion designer's projects, case studies, and atelier work through an editorial, technical-blueprint visual language. Content is sourced from [Hygraph (GraphCMS)](https://hygraph.com/) and the site is deployed on [Vercel](https://vercel.com/).

The defining feature is a **database-free admin editor**. There is no application database — all content lives in Hygraph — yet an authenticated owner can edit most content **inline, directly on the page where it lives**: titles and descriptions through a discreet pencil affordance, and full page bodies through a structured block editor. Visitors see a fast, statically-styled site with zero editing chrome.

## Key Features

- **Inline, on-page editing** — Log in at `/admin/login` with an environment-key passphrase, then edit content where it appears. Scalar fields use an unobtrusive pencil control; page bodies use a drag-to-reorder block editor.
- **Reusable block system** — Page bodies are an ordered list of structural blocks (`richText`, `gallery`, `singleImage`, `mediaShowcase`, `comparison`, `specs`, `documentViewer`, `callout`, `split`, and the signature numbered `entry` layout). One editor and renderer serve project case studies, the atelier page, and more.
- **Built-in Media Library** — Browse every Hygraph asset (draft and published), rename, publish, and delete, plus a crop-and-upload flow powered by [`react-advanced-cropper`](https://www.npmjs.com/package/react-advanced-cropper).
- **Dependency-light authentication** — A single signed, httpOnly cookie backed by Web-Crypto HMAC. The real authorization boundary is the Server Action layer: every write re-verifies the session before mutating Hygraph.
- **Secure by default** — Strict security headers (CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) and an image host allowlist configured in `next.config.ts`. Write tokens never reach the client.
- **Optimistic, fresh content** — CMS-backed pages render per request (`force-dynamic`); writes update and publish atomically while the UI shows the saved value immediately.

## System Architecture

The site is built on React Server Components with small interactive client islands, and all content reads and writes flow through GraphQL against Hygraph.

### Data flow
1. **Public reads** — Server Components `POST` GraphQL to the CMS endpoint with a read-only token, rendering fresh content per request.
2. **Admin session** — Logging in sets one signed, httpOnly cookie. Each server page reads it via `isAuthed()` and threads an `isAdmin` flag into its client islands, which then render inline edit controls.
3. **Writes** — Edits are dispatched to **Server Actions**, which re-verify the session, mutate the draft via a secret mutation token, and publish — never exposing the write token to the browser.

### Core components
- **App Router routes** — Home, `portfolio/` grid and `portfolio/[slug]/` case studies, `about/`, `atelier/`, `contact/`, plus the `admin/` dashboard, media library, and settings.
- **`src/lib/` core** — Framework-light modules for CMS access (`cms.ts`), session crypto (`session.ts`, Web Crypto only), cookie helpers (`auth.ts`), and media data (`getAssets.ts`).
- **`src/components/blocks/`** — The shared block system: a single `sanitizeBlocks` validator runs on both render and save, silently dropping malformed blocks so a bad layout can never break a page.

## Technologies Used

- **Framework**: Next.js 16 (App Router), React 19
- **Language**: TypeScript
- **Styling**: SCSS modules + CSS custom properties (light theme), `next/font`
- **Content**: Hygraph (GraphCMS)
- **Animation**: Framer Motion
- **Deployment**: Vercel (with `@vercel/speed-insights`)

## Project Structure

```text
tayler-carney-portfolio/
├── src/
│   ├── app/              # App Router routes (public pages + admin)
│   │   └── admin/        # Login, dashboard, media library, settings, Server Actions
│   ├── components/       # Shared UI + the reusable block system (blocks/)
│   ├── lib/              # CMS access, sessions, auth, media data layer
│   └── styles/           # SCSS modules, themes, and CSS custom properties
├── next.config.ts        # Security headers + image host allowlist
└── AGENTS.md             # Architecture & onboarding reference
```

## Getting Started

### Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- A **Hygraph** project to source content from

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/SharkFinPro/tayler-carney-portfolio.git
cd tayler-carney-portfolio
npm install
```

### Configuration

Create a `.env.local` file in the project root with the following server-only variables:

```bash
CMS_ENDPOINT=            # Hygraph Content API endpoint
CMS_TOKEN=              # Public read token
HYGRAPH_MUTATION_TOKEN= # Draft read + write token
CMS_MUTATION_ENDPOINT=  # Optional: write endpoint, if CMS_ENDPOINT is the read CDN
ADMIN_KEY=             # Admin login passphrase + session signing key
WEBSITE_URL=           # Base URL for metadata, sitemap, and OpenGraph
```

> **Hygraph permissions:** the mutation token needs **Read (Draft)** + **Update (Draft)** + **Publish** on every editable model, plus **Unpublish** + **Delete** on `Project` for the archived drawer, and **Create / Read (Draft) / Update (Draft) / Publish / Unpublish / Delete** on `Asset` for the Media Library.
>
> `Read (Draft)` is easy to leave out — it is a *read* permission on a token named for mutations — and leaving it out degrades quietly rather than erroring: admins see stale content and duplicate slugs become creatable. See [AGENTS.md](AGENTS.md) for the four places that depend on it.

### Development

Start the development server (defaults to [http://localhost:3000](http://localhost:3000)):

```bash
npm run dev
```

### Production Build

Compile and serve the production build:

```bash
npm run build
npm start
```

### Other Commands

```bash
npm run verify        # typecheck + lint + test:coverage — what CI runs
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint (flat config) — app rules, a11y, and the test-file rules
npm test              # Vitest, single run
npm run test:watch    # Vitest, watch mode
npm run test:coverage # Vitest with a coverage report, and the coverage floors
npm run test:mutation # Stryker — breaks the code on purpose, ~5 min, weekly in CI
```

### Environment validation

The environment contract in [.env.example](.env.example) is checked at **build**
time by [src/lib/env.ts](src/lib/env.ts). A missing or malformed required
variable fails the build rather than producing a subtly wrong deploy — an
unset `WEBSITE_URL`, for instance, would otherwise point every canonical URL
and OpenGraph tag at localhost.

Questionable-but-working configurations are warnings instead, printed on every
build without blocking it. Set `SKIP_ENV_VALIDATION=1` to skip the check
entirely; CI does this, since it builds to prove the app compiles and holds no
production secrets.

### AI assistance (optional)

Two optional features, both behind one `GEMINI_API_KEY`:

- **Draft with AI**, in the block editor: pick images from the Media Library,
  answer a few short questions, and get draft content blocks back for review.
- **Suggest**, beside any Alt text field: one sentence describing the image,
  written from the image itself.

Neither ever saves. Drafted blocks wait until you insert them; a suggested
description lands in the field for you to read and edit, because alt text
nobody checked is worse for a screen-reader user than an empty attribute — a
confident wrong description gets believed, a missing one is at least obviously
missing.

**Why Gemini:** it has a free tier that includes image input, and both of
these features are image-driven. Get a key from
[AI Studio](https://aistudio.google.com). `GEMINI_PAGE_MODEL` and
`GEMINI_ALT_TEXT_MODEL` override the model per feature. The defaults were
picked by measuring, not from the model list: on the free tier the *newest*
models are the contended ones, and both `gemini-3.7-flash` and
`gemini-3.5-flash` returned 503 "experiencing high demand" for a page draft
while `gemini-3.6-flash` answered in 14 seconds. A busy model is retried twice
automatically; if one keeps failing, switching model is a config change rather
than a code change.

The free tier does come with a data trade: Google may use free-tier prompts and
responses to improve its products, and human reviewers may read them. Paid
Gemini does not. For images already published on a public site that is usually
fine; for unreleased work sitting in DRAFT it is worth deciding deliberately.

Without a key both features hide themselves and everything else works
unchanged — no one needs a key to run the site.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
