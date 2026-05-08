import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./Home.module.scss";

export const metadata: Metadata = {
  title: "Home"
};

// ─────────────────────────────────────────────────────────────────────────────
// Static page data — swap for CMS fetch when ready
// ─────────────────────────────────────────────────────────────────────────────

const pageData = {
  hero: {
    eyebrow: "Fashion Design & Production",
    headline: "Archive of Structural Design.",
    subtext:
      "A portfolio of garments engineered with the precision of architecture. Documenting pattern-making, material research, and production from concept to final product.",
    primaryCta: { label: "View Portfolio", href: "/portfolio" },
    secondaryCta: { label: "Read About", href: "/about" },
    stats: [
      { key: "Program",  value: "Apparel Design" },
      { key: "Year",     value: "2023 — 2027" },
      { key: "Location", value: "Corvallis, OR" },
      { key: "Status",   value: "Active" },
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

  // Primary = large left card; secondary = right stacked pair
  destinations: [
    {
      ref: "Sec. 01",
      title: "Portfolio",
      description:
        "The full collection of design projects — sketches, technical flats, pattern drafts, and final garments documented from first concept to finished piece.",
      tag: "Projects",
      href: "/portfolio",
      size: "primary" as const,
    },
    {
      ref: "Sec. 02",
      title: "Atelier",
      description:
        "Process work, experiments, and research that doesn't fit a single project — the working studio in document form.",
      tag: "Process",
      href: "/atelier",
      size: "secondary" as const,
    },
    {
      ref: "Sec. 03",
      title: "About",
      description:
        "Background, education, skills, and the philosophy behind the work.",
      tag: "Info",
      href: "/about",
      size: "secondary" as const,
    },
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { hero, archive, destinations } = pageData;

  const primaryCard    = destinations.find((d) => d.size === "primary")!;
  const secondaryCards = destinations.filter((d) => d.size === "secondary");

  return (
    <div className={styles.pageWrapper}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>

          <div className={styles.heroLeft}>
            <span className={styles.heroEyebrow}>{hero.eyebrow}</span>
            <h1 className={styles.heroHeadline}>{hero.headline}</h1>
            <p className={styles.heroSub}>{hero.subtext}</p>
            <div className={styles.heroCta}>
              <Link href={hero.primaryCta.href} className={styles.heroCtaPrimary}>
                {hero.primaryCta.label}
              </Link>
              <Link href={hero.secondaryCta.href} className={styles.heroCtaSecondary}>
                {hero.secondaryCta.label} →
              </Link>
            </div>
          </div>

          <div className={styles.heroRight}>
            <div className={styles.heroDataHeader}>
              <span>TC / Archive</span>
              <span>001</span>
            </div>
            {hero.stats.map((stat) => (
              <div key={stat.key} className={styles.heroDataRow}>
                <span className={styles.heroDataKey}>{stat.key}</span>
                <span className={styles.heroDataVal}>{stat.value}</span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── Dark archive band ─────────────────────────────────────────────── */}
      <section className={styles.archiveBand}>
        <div className={styles.archiveBandInner}>

          <div className={styles.archiveCard}>
            <span className={styles.archiveCardLabel}>{archive.label}</span>
            <h2 className={styles.archiveCardHeadline}>{archive.headline}</h2>
            <p className={styles.archiveCardBody}>{archive.body}</p>
            <Link href={archive.buttonHref} className={styles.archiveCardButton}>
              {archive.buttonLabel}
            </Link>
          </div>

          <div className={styles.archiveImage}>
            <Image
              src={archive.imageUrl}
              alt={archive.imageAlt}
              fill
              sizes="(max-width: 860px) 90vw, 45vw"
            />
          </div>

        </div>
      </section>

      {/* ── Site navigation cards ─────────────────────────────────────────── */}
      <section className={styles.navSection}>
        <div className={styles.navSectionInner}>

          <div className={styles.navSectionHeader}>
            <h3 className={styles.navSectionTitle}>Explore the Site</h3>
            <span className={styles.navSectionMeta}>Index: 3 Sections</span>
          </div>

          <div className={styles.navGrid}>

            <Link href={primaryCard.href} className={styles.navCardPrimary}>
              <div className={styles.navCardBody}>
                <span className={styles.navCardRef}>{primaryCard.ref}</span>
                <h4 className={styles.navCardTitle}>{primaryCard.title}</h4>
                <p className={styles.navCardDesc}>{primaryCard.description}</p>
              </div>
              <div className={styles.navCardFooter}>
                <span className={styles.navCardTag}>{primaryCard.tag}</span>
                <span className={styles.navCardArrow}>↗</span>
              </div>
              <span className={styles.navCardAccent} />
            </Link>

            {secondaryCards.map((card) => (
              <Link key={card.href} href={card.href} className={styles.navCardSecondary}>
                <div className={styles.navCardBody}>
                  <span className={styles.navCardRef}>{card.ref}</span>
                  <h4 className={styles.navCardTitleSmall}>{card.title}</h4>
                  <p className={styles.navCardDesc}>{card.description}</p>
                </div>
                <div className={styles.navCardFooter}>
                  <span className={styles.navCardTag}>{card.tag}</span>
                  <span className={styles.navCardArrow}>↗</span>
                </div>
                <span className={styles.navCardAccent} />
              </Link>
            ))}

          </div>
        </div>
      </section>

    </div>
  );
}