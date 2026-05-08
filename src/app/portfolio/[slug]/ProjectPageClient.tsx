"use client";
import styles from "./Project.module.scss";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import ImageGrid, { ImageGridItem } from "./ImageGrid";

interface ImageAsset {
  url: string;
}

interface Detail {
  title: string;
  description: string;
  image: ImageAsset;
}

interface Project {
  title: string;
  slug: string;
  description: string;
  sketches: ImageAsset[];
  frontFlat: ImageAsset;
  backFlat: ImageAsset;
  sideFlat: ImageAsset;
  details: Detail[];
  patterns: ImageAsset[];
  materials: Detail[];
  techPack: ImageAsset[];
  finalProduct: ImageAsset[];
}

interface ProjectPageClientProps {
  project: Project;
}

// ─── Modal state ────────────────────────────────────────────────────────────
interface ModalState {
  items: ImageGridItem[];
  index: number;
}

// ─── Section IDs for sidebar nav ────────────────────────────────────────────
const SECTIONS = [
  { id: "sketches",     label: "Sketches" },
  { id: "flats",        label: "Flats" },
  { id: "details",      label: "Details" },
  { id: "patterns",     label: "Patterns" },
  { id: "materials",    label: "Materials" },
  { id: "techpack",     label: "Tech Pack" },
  { id: "final",        label: "Final" },
];

export default function ProjectPageClient({ project }: ProjectPageClientProps) {

  const [activeFlat, setActiveFlat] = useState<string>("front");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("sketches");

  // ── Open / close modal ──────────────────────────────────────────────────
  const openModal = useCallback((
    src: string,
    title: string,
    items: ImageGridItem[],
    index: number
  ) => {
    setModal({ items, index });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setModal(null), 300);
  }, []);

  const goNext = useCallback(() => {
    setModal((prev) => {
      if (!prev) return prev;
      return { ...prev, index: (prev.index + 1) % prev.items.length };
    });
  }, []);

  const goPrev = useCallback(() => {
    setModal((prev) => {
      if (!prev) return prev;
      return { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length };
    });
  }, []);

  // ── Keyboard: Esc + arrows ──────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")      closeModal();
      if (e.key === "ArrowRight")  goNext();
      if (e.key === "ArrowLeft")   goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeModal, goNext, goPrev]);

  // ── Lock body scroll when modal is open ────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  // ── Intersection observer for sidebar active state ──────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // ── Smooth scroll to section ────────────────────────────────────────────
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const numSketches     = project.sketches?.length ?? 0;
  const numFlats        = (project.frontFlat ? 1 : 0) + (project.backFlat ? 1 : 0) + (project.sideFlat ? 1 : 0);
  const numDetails      = project.details?.length ?? 0;
  const numPatterns     = project.patterns?.length ?? 0;
  const numMaterials    = project.materials?.length ?? 0;
  const numTechPacks    = project.techPack?.length ?? 0;
  const numFinalProducts = project.finalProduct?.length ?? 0;

  // ── Normalize to ImageGridItem ──────────────────────────────────────────
  const sketchItems: ImageGridItem[]       = (project.sketches ?? []).map((s, i) => ({ url: s.url, title: `Sketch ${i + 1}` }));
  const detailItems: ImageGridItem[]       = (project.details ?? []).map((d) => ({ url: d.image.url, title: d.title, description: d.description }));
  const patternItems: ImageGridItem[]      = (project.patterns ?? []).map((p, i) => ({ url: p.url, title: `Pattern ${i + 1}` }));
  const materialItems: ImageGridItem[]     = (project.materials ?? []).map((m) => ({ url: m.image.url, title: m.title, description: m.description }));
  const techPackItems: ImageGridItem[]     = (project.techPack ?? []).map((t, i) => ({ url: t.url, title: `Tech Pack ${i + 1}` }));
  const finalProductItems: ImageGridItem[] = (project.finalProduct ?? []).map((f, i) => ({ url: f.url, title: `Final Product ${i + 1}` }));

  const currentModalItem = modal ? modal.items[modal.index] : null;

  return (
    <>
      <main className={styles.pageWrapper}>

        {/* ── Modal ────────────────────────────────────────────────────── */}
        {modal && currentModalItem && (
          <div
            className={`${styles.modalOverlay} ${modalVisible ? styles.visible : ""}`}
            onClick={closeModal}
          >
            <div
              className={styles.modalInner}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <span>{currentModalItem.title}</span>
                <div className={styles.modalControls}>
                  {modal.items.length > 1 && (
                    <span className={styles.modalCounter}>
                      {modal.index + 1} / {modal.items.length}
                    </span>
                  )}
                  <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                    Close
                  </button>
                </div>
              </div>
              <div className={styles.modalBody}>
                {modal.items.length > 1 && (
                  <button
                    className={`${styles.modalNav} ${styles.modalNavPrev}`}
                    onClick={goPrev}
                    aria-label="Previous image"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                <Image
                  src={currentModalItem.url}
                  alt={currentModalItem.title}
                  width={1600}
                  height={900}
                />
                {modal.items.length > 1 && (
                  <button
                    className={`${styles.modalNav} ${styles.modalNavNext}`}
                    onClick={goNext}
                    aria-label="Next image"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={styles.pageLayout}>

          {/* ── Sticky sidebar nav ───────────────────────────────────────── */}
          <aside className={styles.sidebarNav}>
            {/* Breadcrumb */}
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <Link href="/portfolio">Portfolio</Link>
              <span aria-hidden="true">→</span>
              <span>{project.title}</span>
            </nav>

            {/* Section progress */}
            <div className={styles.sidebarSections}>
              {SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  className={`${styles.sidebarItem} ${activeSection === id ? styles.sidebarItemActive : ""}`}
                  onClick={() => scrollTo(id)}
                >
                  <span className={styles.sidebarDot} />
                  <span className={styles.sidebarLabel}>{label}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* ── Main content ─────────────────────────────────────────────── */}
          <div className={styles.pageContainer}>
            <div className={styles.mainHeader}>
              <h1>{project.title}</h1>
              <p>{project.description}</p>
            </div>

            {/* 1 — Sketches */}
            <div id="sketches" className={styles.section}>
              <h2>Initial Sketches <span>{numSketches}</span></h2>
              <ImageGrid
                items={sketchItems}
                variant="sketches"
                onOpen={openModal}
              />
            </div>

            {/* 2 — Technical Flats */}
            <div id="flats" className={styles.section}>
              <h2>Technical Flats <span>{numFlats}</span></h2>
              <div className={styles.flatViewSelector}>
                <button onClick={() => setActiveFlat("front")} aria-pressed={activeFlat === "front"} disabled={!project.frontFlat}>Front</button>
                <button onClick={() => setActiveFlat("back")}  aria-pressed={activeFlat === "back"}  disabled={!project.backFlat}>Back</button>
                <button onClick={() => setActiveFlat("side")}  aria-pressed={activeFlat === "side"}  disabled={!project.sideFlat}>Side</button>
              </div>
              <div>
                <div className={styles.flat}>
                  {activeFlat === "front" && project.frontFlat && <>
                    <h3>Front View</h3>
                    <Image src={project.frontFlat.url} alt="Front Flat" width={1000} height={1000}
                           onClick={() => openModal(project.frontFlat.url, "Front Flat", [{ url: project.frontFlat.url, title: "Front Flat" }], 0)}
                           placeholder="blur"
                           blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
                    />
                  </>}
                  {activeFlat === "back" && project.backFlat && <>
                    <h3>Back View</h3>
                    <Image src={project.backFlat.url} alt="Back Flat" width={1000} height={1000}
                           onClick={() => openModal(project.backFlat.url, "Back Flat", [{ url: project.backFlat.url, title: "Back Flat" }], 0)}
                           placeholder="blur"
                           blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
                    />
                  </>}
                  {activeFlat === "side" && project.sideFlat && <>
                    <h3>Side View</h3>
                    <Image src={project.sideFlat.url} alt="Side Flat" width={1000} height={1000}
                           onClick={() => openModal(project.sideFlat.url, "Side Flat", [{ url: project.sideFlat.url, title: "Side Flat" }], 0)}
                           placeholder="blur"
                           blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
                    />
                  </>}
                </div>
              </div>
            </div>

            {/* 3 — Details */}
            <div id="details" className={styles.section}>
              <h2>Details <span>{numDetails}</span></h2>
              <ImageGrid
                items={detailItems}
                variant="grid"
                onOpen={openModal}
              />
            </div>

            {/* 4 — Patterns */}
            <div id="patterns" className={styles.section}>
              <h2>Pattern Drafting <span>{numPatterns}</span></h2>
              <ImageGrid
                items={patternItems}
                variant="patterns"
                onOpen={openModal}
              />
            </div>

            {/* 5 — Materials */}
            <div id="materials" className={styles.section}>
              <h2>Materials List <span>{numMaterials}</span></h2>
              <ImageGrid
                items={materialItems}
                variant="materials"
                onOpen={openModal}
              />
            </div>

            {/* 6 — Tech Pack */}
            <div id="techpack" className={styles.section}>
              <h2>Tech Pack <span>{numTechPacks}</span></h2>
              <ImageGrid
                items={techPackItems}
                variant="techpack"
                onOpen={openModal}
              />
            </div>

            {/* 7 — Final Product */}
            <div id="final" className={styles.section}>
              <h2>Final Product <span>{numFinalProducts}</span></h2>
              <ImageGrid
                items={finalProductItems}
                variant="finalProduct"
                onOpen={openModal}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}