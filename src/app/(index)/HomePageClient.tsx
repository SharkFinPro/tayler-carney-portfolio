"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faPen, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import styles from "./Home.module.scss";
import { AnimatedSection } from "@/components/AnimatedSection";
import { useDragReorder } from "@/components/blocks/useDragReorder";
import HeroEditor from "./HeroEditor";
import ArchiveEditor from "./ArchiveEditor";
import CardEditor from "./CardEditor";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditModal, { fieldStyles as f, newId } from "@/components/EditModal";
import { updateHome } from "@/app/admin/contentActions";
import type { HomeContent, HomeDestination } from "@/lib/home";

interface HomePageClientProps {
  siteId: string;
  home: HomeContent;
  isAdmin?: boolean;
}

type CardRow = HomeDestination & { _id: string };
type CardEditState = { mode: "edit"; id: string } | { mode: "add" };

const withId = (c: HomeDestination): CardRow => ({ ...c, _id: newId() });
const stripId = ({ _id, ...rest }: CardRow): HomeDestination => rest;

// Card size is purely positional now — the first card is the large "primary"
// tile, the rest are "secondary". Order is controlled by drag & drop, so we
// derive size from index rather than storing an independent choice.
const normalize = (dests: HomeDestination[]): HomeDestination[] =>
  dests.map((d, i) => ({ ...d, size: i === 0 ? "primary" : "secondary" }));

export default function HomePageClient({ siteId, home: initial, isAdmin = false }: HomePageClientProps) {
  const router = useRouter();

  // Section state is split so the card list can carry stable ids for dragging,
  // independent of the hero/archive copy.
  const [hero, setHero] = useState(initial.hero);
  const [archive, setArchive] = useState(initial.archive);
  const [exploreTitle, setExploreTitle] = useState(initial.exploreTitle);
  const [cards, setCards] = useState<CardRow[]>(() => initial.destinations.map(withId));

  // Latest values for closures that outlive a render (drag commit, editText).
  const heroRef = useRef(hero);
  const archiveRef = useRef(archive);
  const exploreTitleRef = useRef(exploreTitle);
  const cardsRef = useRef(cards);
  heroRef.current = hero;
  archiveRef.current = archive;
  exploreTitleRef.current = exploreTitle;
  cardsRef.current = cards;

  useEffect(() => {
    setHero(initial.hero);
    setArchive(initial.archive);
    setExploreTitle(initial.exploreTitle);
    setCards(initial.destinations.map(withId));
  }, [initial]);

  const [editor, setEditor] = useState<null | "hero" | "archive" | "explore">(null);
  const [exploreDraft, setExploreDraft] = useState("");
  const [cardEditor, setCardEditor] = useState<CardEditState | null>(null);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);

  // Persist a whole HomeContent: optimistic, with a rollback-via-refresh on
  // failure (matching the site's no-revalidate write semantics). Returns an
  // error string on failure, or null on success.
  async function persist(input: HomeContent): Promise<string | null> {
    const next: HomeContent = { ...input, destinations: normalize(input.destinations) };
    setHero(next.hero);
    setArchive(next.archive);
    setExploreTitle(next.exploreTitle);
    setCards(next.destinations.map(withId));
    const res = await updateHome(siteId, next);
    if ("error" in res) {
      router.refresh();
      return res.error;
    }
    setHero(res.home.hero);
    setArchive(res.home.archive);
    setExploreTitle(res.home.exploreTitle);
    setCards(res.home.destinations.map(withId));
    return null;
  }

  function buildHome(over: Partial<HomeContent>): HomeContent {
    return {
      hero: over.hero ?? heroRef.current,
      archive: over.archive ?? archiveRef.current,
      exploreTitle: over.exploreTitle ?? exploreTitleRef.current,
      destinations: over.destinations ?? cardsRef.current.map(stripId),
    };
  }

  // Drag-reorder the cards in place; commit the new order on drop.
  const drag = useDragReorder<CardRow>({
    items: cards,
    setItems: setCards,
    getKey: (c) => c._id,
    mode: "grid",
    onCommit: (orderedKeys) => {
      const byId = new Map(cardsRef.current.map((c) => [c._id, c]));
      const ordered = orderedKeys.map((k) => byId.get(k)).filter((c): c is CardRow => Boolean(c));
      void persist(buildHome({ destinations: ordered.map(stripId) }));
    },
  });

  function saveCard(card: HomeDestination): Promise<string | null> {
    if (cardEditor?.mode === "edit") {
      const id = cardEditor.id;
      const next = cardsRef.current.map((c) => (c._id === id ? { ...card, _id: id } : c));
      return persist(buildHome({ destinations: next.map(stripId) }));
    }
    const next = [...cardsRef.current, withId(card)];
    return persist(buildHome({ destinations: next.map(stripId) }));
  }

  function deleteCard(id: string): Promise<string | null> {
    const next = cardsRef.current.filter((c) => c._id !== id);
    return persist(buildHome({ destinations: next.map(stripId) }));
  }

  // Public site: the live grid — first card is the large primary tile.
  function renderPublicCard(card: CardRow, index: number) {
    const isPrimary = index === 0;
    const cls = isPrimary ? styles.navCardPrimary : styles.navCardSecondary;
    const titleCls = isPrimary ? styles.navCardTitle : styles.navCardTitleSmall;
    return (
      <Link key={card._id} href={card.href} className={cls}>
        <div className={styles.navCardBody}>
          <span className={styles.navCardRef}>{card.ref}</span>
          <h4 className={titleCls}>{card.title}</h4>
          <p className={styles.navCardDesc}>{card.description}</p>
        </div>
        <div className={styles.navCardFooter}>
          <span className={styles.navCardTag}>{card.tag}</span>
          <span className={styles.navCardArrow}>↗</span>
        </div>
        <span className={styles.navCardAccent} />
      </Link>
    );
  }

  // Admin: the same grid, edited in place. Each card is a non-navigating block
  // with a drag grip and edit pencil; dragging reflows the grid, and whichever
  // card lands first becomes the large primary tile.
  function renderAdminCard(card: CardRow, index: number, floating = false) {
    const isPrimary = index === 0;
    const cls = isPrimary ? styles.navCardPrimary : styles.navCardSecondary;
    const titleCls = isPrimary ? styles.navCardTitle : styles.navCardTitleSmall;
    return (
      <div
        key={card._id}
        ref={floating ? undefined : drag.registerCard(card._id)}
        className={`${cls} ${styles.navCardAdmin} ${floating ? styles.navCardFloating : ""}`}
      >
        <div className={styles.cardAdminBar}>
          <button
            type="button"
            className={styles.cardDragBtn}
            aria-label="Reorder card. Press arrow keys to move, or drag."
            onPointerDown={(e) => drag.startDrag(index, card._id, e)}
            onKeyDown={drag.keyboardReorder(card._id)}
          >
            <FontAwesomeIcon icon={faGripVertical} />
          </button>
          <button
            type="button"
            className={styles.cardEditBtn}
            aria-label={`Edit ${card.title || "card"}`}
            onClick={() => setCardEditor({ mode: "edit", id: card._id })}
          >
            <FontAwesomeIcon icon={faPen} />
          </button>
          <button
            type="button"
            className={styles.cardDeleteBtn}
            aria-label={`Delete ${card.title || "card"}`}
            onClick={() => setCardToDelete(card._id)}
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>

        <div className={styles.navCardBody}>
          <span className={styles.navCardRef}>{card.ref}</span>
          <h4 className={titleCls}>{card.title || "Untitled card"}</h4>
          <p className={styles.navCardDesc}>{card.description}</p>
        </div>
        <div className={styles.navCardFooter}>
          <span className={styles.navCardTag}>{card.tag}</span>
          <span className={styles.navCardArrow}>↗</span>
        </div>
        <span className={styles.navCardAccent} />
      </div>
    );
  }

  const draggingCard = drag.draggingKey ? cards.find((c) => c._id === drag.draggingKey) : null;

  return (
    <div className={styles.pageWrapper}>
      <AnimatedSection>
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
              {isAdmin && (
                <button type="button" className={styles.editSectionBtn} onClick={() => setEditor("hero")}>
                  <FontAwesomeIcon icon={faPen} /> Edit hero
                </button>
              )}
            </div>

            <div className={styles.heroRight}>
              <div className={styles.heroDataHeader}>
                <span>{hero.dataHeading}</span>
                <span>{hero.dataIndex}</span>
              </div>
              {hero.stats.map((stat, i) => (
                <div key={`${stat.key}-${i}`} className={styles.heroDataRow}>
                  <span className={styles.heroDataKey}>{stat.key}</span>
                  <span className={styles.heroDataVal}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </AnimatedSection>

      <AnimatedSection>
        <section className={styles.archiveBand}>
          <div className={styles.archiveBandInner}>
            <div className={styles.archiveCard}>
              <span className={styles.archiveCardLabel}>{archive.label}</span>
              <h2 className={styles.archiveCardHeadline}>{archive.headline}</h2>
              <p className={styles.archiveCardBody}>{archive.body}</p>
              <Link href={archive.buttonHref} className={styles.archiveCardButton}>
                {archive.buttonLabel}
              </Link>
              {isAdmin && (
                <button
                  type="button"
                  className={`${styles.editSectionBtn} ${styles.editSectionBtnDark}`}
                  onClick={() => setEditor("archive")}
                >
                  <FontAwesomeIcon icon={faPen} /> Edit archive band
                </button>
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
              <h3 className={styles.navSectionTitle}>{exploreTitle}</h3>
              <span className={styles.navSectionMeta}>Index: {cards.length} Sections</span>
              {isAdmin && (
                <button
                  type="button"
                  className={styles.editSectionBtn}
                  onClick={() => {
                    setExploreDraft(exploreTitleRef.current);
                    setEditor("explore");
                  }}
                >
                  <FontAwesomeIcon icon={faPen} /> Edit heading
                </button>
              )}
            </div>

            {isAdmin ? (
              <>
                <div className={styles.navGrid}>
                  {cards.map((card, index) =>
                    card._id === drag.draggingKey ? (
                      // Height is driven by the grid/CSS, not the dragged card's
                      // own size — otherwise a tall primary dropped into a small
                      // secondary slot would inflate that row.
                      <div
                        key={card._id}
                        className={`${index === 0 ? styles.navCardPrimary : styles.navCardSecondary} ${styles.navCardPlaceholder}`}
                      />
                    ) : (
                      renderAdminCard(card, index)
                    )
                  )}
                </div>

                <button
                  type="button"
                  className={styles.addCardTile}
                  onClick={() => setCardEditor({ mode: "add" })}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Add card</span>
                </button>

                <div className="srOnly" role="status" aria-live="polite">
                  {drag.announcement}
                </div>
              </>
            ) : (
              <div className={styles.navGrid}>
                {cards.map((card, index) => renderPublicCard(card, index))}
              </div>
            )}
          </div>
        </section>
      </AnimatedSection>

      {isAdmin && draggingCard && (
        <div className={styles.cardFloatingLayer} style={drag.floatingStyle}>
          {renderAdminCard(draggingCard, cards.findIndex((c) => c._id === draggingCard._id), true)}
        </div>
      )}

      {editor === "hero" && (
        <HeroEditor
          initial={hero}
          onClose={() => setEditor(null)}
          onSave={(nextHero) => persist(buildHome({ hero: nextHero }))}
        />
      )}

      {editor === "archive" && (
        <ArchiveEditor
          initial={archive}
          onClose={() => setEditor(null)}
          onSave={(nextArchive) => persist(buildHome({ archive: nextArchive }))}
        />
      )}

      {editor === "explore" && (
        <EditModal
          title="Edit heading"
          onClose={() => setEditor(null)}
          onSave={() => persist(buildHome({ exploreTitle: exploreDraft }))}
        >
          <label className={f.formField}>
            <span className={f.editFieldLabel}>Heading</span>
            <input
              className={f.editInput}
              value={exploreDraft}
              onChange={(e) => setExploreDraft(e.target.value)}
            />
          </label>
        </EditModal>
      )}

      {cardEditor && (
        <CardEditor
          mode={cardEditor.mode}
          initial={
            cardEditor.mode === "edit"
              ? stripId(cards.find((c) => c._id === cardEditor.id) ?? cards[0])
              : { ref: "", title: "", description: "", tag: "", href: "/", size: "secondary" }
          }
          onClose={() => setCardEditor(null)}
          onSave={saveCard}
        />
      )}

      {cardToDelete && (
        <ConfirmDialog
          title={`Delete the "${
            cards.find((c) => c._id === cardToDelete)?.title || "Untitled"
          }" card?`}
          message="This permanently removes the card from the CMS. This can't be undone."
          onConfirm={() => deleteCard(cardToDelete)}
          onClose={() => setCardToDelete(null)}
        />
      )}
    </div>
  );
}
