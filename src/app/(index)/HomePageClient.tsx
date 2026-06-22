"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import styles from "./Home.module.scss";
import { AnimatedSection } from "@/components/AnimatedSection";
import EditableText from "@/components/EditableText";
import HomeCardEditor from "./HomeCardEditor";
import { updateHome } from "@/app/admin/contentActions";
import type { HomeContent, HomeStat, HomeDestination } from "@/lib/home";

interface HomePageClientProps {
  siteId: string;
  home: HomeContent;
  isAdmin?: boolean;
}

type SaveResult = { ok: true } | { error: string };

export default function HomePageClient({ siteId, home: initial, isAdmin = false }: HomePageClientProps) {
  const router = useRouter();
  const [home, setHome] = useState<HomeContent>(initial);
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => setHome(initial), [initial]);

  const [editor, setEditor] = useState<null | "stats" | "destinations">(null);

  // Persist a whole HomeContent: optimistic, with a rollback-via-refresh on
  // failure (matching the site's no-revalidate write semantics).
  async function persist(next: HomeContent): Promise<SaveResult> {
    setHome(next);
    const res = await updateHome(siteId, next);
    if ("error" in res && res.ok === false) {
      router.refresh();
      return { error: res.error };
    }
    setHome(res.home);
    return { ok: true };
  }

  // Inline-text save: apply a mutation to a draft copy, then persist. Returned in
  // the shape EditableText expects so it can surface errors in place.
  function editText(mutate: (draft: HomeContent) => void) {
    return async (): Promise<SaveResult> => {
      const next: HomeContent = structuredClone(homeRef.current);
      mutate(next);
      return persist(next);
    };
  }

  const { hero, archive, destinations } = home;
  const primaryCard = destinations.find((d) => d.size === "primary");
  const secondaryCards = destinations.filter((d) => d.size === "secondary");

  return (
    <div className={styles.pageWrapper}>
      <AnimatedSection>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroLeft}>
              <span className={styles.heroEyebrow}>
                <EditableText value={hero.eyebrow} editable={isAdmin} onSave={(v) => editText((d) => { d.hero.eyebrow = v as string; })()}>
                  {hero.eyebrow}
                </EditableText>
              </span>
              <h1 className={styles.heroHeadline}>
                <EditableText value={hero.headline} editable={isAdmin} floatEdit onSave={(v) => editText((d) => { d.hero.headline = v as string; })()}>
                  {hero.headline}
                </EditableText>
              </h1>
              <p className={styles.heroSub}>
                <EditableText value={hero.subtext} editable={isAdmin} multiline onSave={(v) => editText((d) => { d.hero.subtext = v as string; })()}>
                  {hero.subtext}
                </EditableText>
              </p>
              <div className={styles.heroCta}>
                <Link href={hero.primaryCta.href} className={styles.heroCtaPrimary}>
                  {hero.primaryCta.label}
                </Link>
                <Link href={hero.secondaryCta.href} className={styles.heroCtaSecondary}>
                  {hero.secondaryCta.label} →
                </Link>
              </div>
              {isAdmin && (
                <span className={styles.adminHint}>
                  <EditableText value={hero.primaryCta.label} editable onSave={(v) => editText((d) => { d.hero.primaryCta.label = v as string; })()}>
                    {`Primary button: ${hero.primaryCta.label}`}
                  </EditableText>
                  {"  ·  "}
                  <EditableText value={hero.secondaryCta.label} editable onSave={(v) => editText((d) => { d.hero.secondaryCta.label = v as string; })()}>
                    {`Secondary button: ${hero.secondaryCta.label}`}
                  </EditableText>
                </span>
              )}
            </div>

            <div className={styles.heroRight}>
              <div className={styles.heroDataHeader}>
                <span>TC / Archive</span>
                <span>001</span>
              </div>
              {hero.stats.map((stat, i) => (
                <div key={`${stat.key}-${i}`} className={styles.heroDataRow}>
                  <span className={styles.heroDataKey}>{stat.key}</span>
                  <span className={styles.heroDataVal}>{stat.value}</span>
                </div>
              ))}
              {isAdmin && (
                <button type="button" className={styles.editSectionBtn} onClick={() => setEditor("stats")}>
                  Edit stats
                </button>
              )}
            </div>
          </div>
        </section>
      </AnimatedSection>

      <AnimatedSection>
        <section className={styles.archiveBand}>
          <div className={styles.archiveBandInner}>
            <div className={styles.archiveCard}>
              <span className={styles.archiveCardLabel}>
                <EditableText value={archive.label} editable={isAdmin} onSave={(v) => editText((d) => { d.archive.label = v as string; })()}>
                  {archive.label}
                </EditableText>
              </span>
              <h2 className={styles.archiveCardHeadline}>
                <EditableText value={archive.headline} editable={isAdmin} floatEdit onSave={(v) => editText((d) => { d.archive.headline = v as string; })()}>
                  {archive.headline}
                </EditableText>
              </h2>
              <p className={styles.archiveCardBody}>
                <EditableText value={archive.body} editable={isAdmin} multiline onSave={(v) => editText((d) => { d.archive.body = v as string; })()}>
                  {archive.body}
                </EditableText>
              </p>
              <Link href={archive.buttonHref} className={styles.archiveCardButton}>
                {archive.buttonLabel}
              </Link>
              {isAdmin && (
                <span className={styles.adminHint}>
                  <EditableText value={archive.buttonLabel} editable onSave={(v) => editText((d) => { d.archive.buttonLabel = v as string; })()}>
                    {`Button: ${archive.buttonLabel}`}
                  </EditableText>
                </span>
              )}
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
      </AnimatedSection>

      <AnimatedSection>
        <section className={styles.navSection}>
          <div className={styles.navSectionInner}>
            <div className={styles.navSectionHeader}>
              <h3 className={styles.navSectionTitle}>Explore the Site</h3>
              <span className={styles.navSectionMeta}>Index: {destinations.length} Sections</span>
            </div>

            {isAdmin && (
              <button type="button" className={styles.editSectionBtn} onClick={() => setEditor("destinations")}>
                Edit cards
              </button>
            )}

            <div className={styles.navGrid}>
              {primaryCard && (
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
              )}

              {secondaryCards.map((card, i) => (
                <Link key={`${card.href}-${i}`} href={card.href} className={styles.navCardSecondary}>
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
      </AnimatedSection>

      {editor === "stats" && (
        <HomeCardEditor<HomeStat>
          title="Edit hero stats"
          itemNoun="stat"
          initial={hero.stats}
          columns={[
            { key: "key", label: "Label" },
            { key: "value", label: "Value" },
          ]}
          makeEmpty={() => ({ key: "", value: "" })}
          onClose={() => setEditor(null)}
          onSave={async (stats) => {
            const res = await persist({ ...homeRef.current, hero: { ...homeRef.current.hero, stats } });
            return "error" in res ? res.error : null;
          }}
        />
      )}

      {editor === "destinations" && (
        <HomeCardEditor<HomeDestination>
          title="Edit explore cards"
          itemNoun="card"
          initial={destinations}
          columns={[
            { key: "ref", label: "Reference (e.g. Sec. 01)" },
            { key: "title", label: "Title" },
            { key: "description", label: "Description", type: "multiline" },
            { key: "tag", label: "Tag" },
            { key: "href", label: "Link (href)" },
            {
              key: "size",
              label: "Size",
              type: "select",
              options: [
                { value: "primary", label: "Primary (large)" },
                { value: "secondary", label: "Secondary" },
              ],
            },
          ]}
          makeEmpty={() => ({ ref: "", title: "", description: "", tag: "", href: "/", size: "secondary" })}
          onClose={() => setEditor(null)}
          onSave={async (next) => {
            const res = await persist({ ...homeRef.current, destinations: next });
            return "error" in res ? res.error : null;
          }}
        />
      )}
    </div>
  );
}
