// The content the stubbed CMS serves.
//
// Every string here is deliberately distinctive — "Stubbed" prefixes, unlikely
// numbers — so that a test asserting on one is proving the value travelled
// from the CMS response through the render, rather than matching something the
// app would have produced on its own. `sanitizeHome` has a full set of
// defaults, so a fixture of `{}` still renders a complete homepage; only an
// unmistakable value can tell the two apart.

export const SITE_ID = "stub-site-1";

/** Named so the specs never index into `hero.stats`. */
export const FIRST_STAT = { key: "Stubbed Stat", value: "42" };

export const HOME = {
  hero: {
    eyebrow: "Stubbed Eyebrow",
    headline: "Stubbed Headline From The CMS",
    subtext: "Stubbed hero subtext.",
    primaryCta: { label: "Stubbed Primary", href: "/portfolio" },
    secondaryCta: { label: "Stubbed Secondary", href: "/about" },
    dataHeading: "TC / Stub",
    dataIndex: "417",
    stats: [FIRST_STAT, { key: "Second Stat", value: "7" }],
  },
  archive: {
    label: "Stubbed Archive Label",
    headline: "Stubbed Archive Headline",
    body: "Stubbed archive body copy.",
    buttonLabel: "Stubbed Archive Button",
    buttonHref: "/portfolio",
    imageUrl: "",
    imageAlt: "",
  },
  exploreTitle: "Stubbed Explore Title",
  destinations: [
    {
      ref: "01",
      title: "Stubbed Destination",
      description: "Stubbed destination description.",
      tag: "STUB",
      href: "/portfolio",
      size: "primary",
    },
  ],
};

// Named rather than reached for by index. `noUncheckedIndexedAccess` is on
// across this repo, so `PROJECTS[0]` is `T | undefined` and every use would
// need a guard; naming them is what the convention asks for anyway, and it
// makes the tests read as what they mean.

export const COAT = {
  id: "stub-project-1",
  title: "Stubbed Wool Coat",
  slug: "stubbed-wool-coat",
  description: "A stubbed structural wool coat.",
};

export const JACKET = {
  id: "stub-project-2",
  title: "Stubbed Padded Jacket",
  slug: "stubbed-padded-jacket",
  description: "A stubbed padded jacket.",
};

export const ARCHIVED = {
  id: "stub-project-3",
  title: "Stubbed Archived Piece",
  slug: "stubbed-archived-piece",
  description: "Archived, so it must not appear in the grid.",
};

/** CMS order, deliberately not the order the portfolio config asks for. */
export const PROJECTS = [COAT, JACKET, ARCHIVED];

// The third project is archived, which is the only reason the grid should show
// two of the three. A test that asserts "two projects" without this would pass
// on a broken filter simply because the fixture was short.
export const PORTFOLIO_CONFIG = {
  entries: [
    { id: "stub-project-2", archived: false },
    { id: "stub-project-1", archived: false },
    { id: "stub-project-3", archived: true },
  ],
};

export const GLOBAL = {
  siteName: "Stubbed Site Name",
  ownerName: "Stubbed Owner",
  email: "stub@example.test",
};

export const SEO = {
  defaultTitle: "Stubbed Default Title",
  defaultDescription: "Stubbed default description.",
};

/** One SiteData row, matching the singleton the app expects. */
export const SITE_DATA = {
  id: SITE_ID,
  home: HOME,
  portfolio: PORTFOLIO_CONFIG,
  global: GLOBAL,
  seo: SEO,
  about: null,
  contact: null,
};
