// Homepage content model.
//
// The homepage ("/") is a singleton stored in the one SiteData entry's `home`
// JSON field — an isolated, page-scoped object (a corrupt `home` value can't
// affect other pages). This module is intentionally pure (no server-only
// imports) so the same types, defaults, and `sanitizeHome` validator can run on
// both render and save, exactly like `sanitizeBlocks` does for block layouts.

import { isSafeUrl } from "@/components/blocks/richText/richTextAst";

export type HomeCta = { label: string; href: string };
export type HomeStat = { key: string; value: string };
export type DestinationSize = "primary" | "secondary";
export type HomeDestination = {
  ref: string;
  title: string;
  description: string;
  tag: string;
  href: string;
  size: DestinationSize;
};

export type HomeContent = {
  hero: {
    eyebrow: string;
    headline: string;
    subtext: string;
    primaryCta: HomeCta;
    secondaryCta: HomeCta;
    // Labels on the hero's right-side data panel header ("TC / Archive" / "001").
    dataHeading: string;
    dataIndex: string;
    stats: HomeStat[];
  };
  archive: {
    label: string;
    headline: string;
    body: string;
    buttonLabel: string;
    buttonHref: string;
    imageUrl: string;
    imageAlt: string;
  };
  // Heading above the "explore the site" navigation grid.
  exploreTitle: string;
  destinations: HomeDestination[];
};

// Seed content — mirrors the original hardcoded homepage exactly, so the page is
// unchanged until an admin edits it (and is the fallback when `home` is null).
export const DEFAULT_HOME: HomeContent = {
  hero: {
    eyebrow: "Fashion Design & Production",
    headline: "Archive of Structural Design.",
    subtext:
      "A portfolio of garments engineered with the precision of architecture. Documenting pattern-making, material research, and production from concept to final product.",
    primaryCta: { label: "View Portfolio", href: "/portfolio" },
    secondaryCta: { label: "Read About", href: "/about" },
    dataHeading: "TC / Archive",
    dataIndex: "001",
    stats: [
      { key: "Program", value: "Apparel Design" },
      { key: "Year", value: "2023 — 2027" },
      { key: "Location", value: "Corvallis, OR" },
      { key: "Status", value: "Active" },
    ],
  },
  archive: {
    label: "System Overview 01",
    headline: "About the Archive",
    body: "Each garment in this collection is treated as a structural feat. The practice prioritizes the technical precision of pattern-making over ephemeral trends, creating a visual language that mirrors architectural blueprints.",
    buttonLabel: "Read More",
    buttonHref: "/about",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBDK47nqSrafWv-0jCRGsliMV0uXg05oyzhNOdBalBuF4YTAhah7yurIy9HyhR4Qpj0u12mINQKs4_2arv4gVC4Ub2goUe4ckiCEML9a4Et87U1fmNzU0GrtptSeyZqfgZv0pePbzmzaJRaTT5dinzM_NxxhXQLQ45pFjTCPBXyJc30zEsnKwbU-I7KCeL0eBPjsycYdRDvazN0INuxtHaBjFi-PG_MU3ZMIuVE29xiqXlwKHb8gymDAD9WZbEyI_bz7-0dUNvP1iU",
    imageAlt: "Archival garment on concrete pedestal",
  },
  exploreTitle: "Explore the Site",
  destinations: [
    {
      ref: "Sec. 01",
      title: "Portfolio",
      description:
        "The full collection of design projects — sketches, technical flats, pattern drafts, and final garments documented from first concept to finished piece.",
      tag: "Projects",
      href: "/portfolio",
      size: "primary",
    },
    {
      ref: "Sec. 02",
      title: "Atelier",
      description:
        "Process work, experiments, and research that doesn't fit a single project — the working studio in document form.",
      tag: "Process",
      href: "/atelier",
      size: "secondary",
    },
    {
      ref: "Sec. 03",
      title: "About",
      description: "Background, education, skills, and the philosophy behind the work.",
      tag: "Info",
      href: "/about",
      size: "secondary",
    },
  ],
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// Keep hrefs to safe schemes/relative paths (defense-in-depth: runs server-side
// on save so an unsafe href can never be persisted even if the client is bypassed).
const safeHref = (v: unknown, fallback: string): string => {
  const s = str(v, fallback);
  return isSafeUrl(s) ? s : fallback;
};

const cta = (v: unknown, fallback: HomeCta): HomeCta => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { label: str(o.label, fallback.label), href: safeHref(o.href, fallback.href) };
};

/**
 * Coerce arbitrary JSON (from the CMS or the client editor) into a complete,
 * well-typed HomeContent. Missing keys fall back to DEFAULT_HOME; unexpected
 * types are dropped. Repeatable lists are mapped item-by-item and bad rows are
 * skipped, so a single malformed entry can never break the page.
 */
export function sanitizeHome(raw: unknown): HomeContent {
  const d = DEFAULT_HOME;
  const data = (raw ?? {}) as Record<string, unknown>;
  const hero = (data.hero ?? {}) as Record<string, unknown>;
  const archive = (data.archive ?? {}) as Record<string, unknown>;

  const stats: HomeStat[] = Array.isArray(hero.stats)
    ? hero.stats
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return { key: str(o.key), value: str(o.value) };
        })
        .filter((s) => s.key || s.value)
    : d.hero.stats;

  const destinations: HomeDestination[] = Array.isArray(data.destinations)
    ? data.destinations
        .map((item) => {
          const o = (item ?? {}) as Record<string, unknown>;
          return {
            ref: str(o.ref),
            title: str(o.title),
            description: str(o.description),
            tag: str(o.tag),
            href: safeHref(o.href, "/"),
            size: o.size === "primary" ? "primary" : ("secondary" as DestinationSize),
          };
        })
        .filter((c) => c.title || c.description)
    : d.destinations;

  return {
    hero: {
      eyebrow: str(hero.eyebrow, d.hero.eyebrow),
      headline: str(hero.headline, d.hero.headline),
      subtext: str(hero.subtext, d.hero.subtext),
      primaryCta: cta(hero.primaryCta, d.hero.primaryCta),
      secondaryCta: cta(hero.secondaryCta, d.hero.secondaryCta),
      dataHeading: str(hero.dataHeading, d.hero.dataHeading),
      dataIndex: str(hero.dataIndex, d.hero.dataIndex),
      stats,
    },
    archive: {
      label: str(archive.label, d.archive.label),
      headline: str(archive.headline, d.archive.headline),
      body: str(archive.body, d.archive.body),
      buttonLabel: str(archive.buttonLabel, d.archive.buttonLabel),
      buttonHref: safeHref(archive.buttonHref, d.archive.buttonHref),
      imageUrl: str(archive.imageUrl, d.archive.imageUrl),
      imageAlt: str(archive.imageAlt, d.archive.imageAlt),
    },
    exploreTitle: str(data.exploreTitle, d.exploreTitle),
    destinations,
  };
}
