"use client";
import styles from "./Project.module.scss";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import ImageGrid, { ImageGridItem } from "./ImageGrid";
import ProjectModal from "./ProjectModal";
import ProjectSidebar from "./ProjectSidebar";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";

interface ImageAsset {
  url: string;
}

interface Detail {
  title: string;
  description: string;
  image: ImageAsset;
}

type TechPackInfo = {
  style: number;
  garmentName: string;
  season: string;
  fitType: string;
  brand: string;
  sizeRange: string;
  sampleSize: string;
  designer: string;
  fabrication: string;
};

interface Project {
  title: string;
  slug: string;
  description: string;
  sketches: ImageAsset[];
  digitalRendering: ImageAsset;
  frontFlat: ImageAsset;
  backFlat: ImageAsset;
  sideFlat: ImageAsset;
  coloredFlats: Detail[];
  details: Detail[];
  patterns: ImageAsset[];
  materials: Detail[];
  techPackHeader: TechPackInfo;
  techPacks: Detail[];
  looks: Detail[];
  finalProduct: ImageAsset[];
}

interface ProjectNavItem {
  slug: string;
  title: string;
}

interface ProjectPageClientProps {
  project: Project;
  prevProject: ProjectNavItem | null;
  nextProject: ProjectNavItem | null;
}

interface ModalState {
  items: ImageGridItem[];
  index: number;
}

const SECTIONS = [
  { id: "sketches",          label: "Sketches" },
  { id: "digitalRendering",  label: "Digital" },
  { id: "flats",             label: "Flats" },
  { id: "looks",             label: "Looks" },
  { id: "details",           label: "Details" },
  { id: "patterns",          label: "Patterns" },
  { id: "materials",         label: "Materials" },
  { id: "techpack",          label: "Tech Pack" },
  { id: "final",             label: "Final" },
];

const fadeInVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function ProjectPageClient({ project, prevProject, nextProject }: ProjectPageClientProps) {
  const numSketches      = project.sketches?.length ?? 0;
  const numFlats         = (project.frontFlat ? 1 : 0) + (project.backFlat ? 1 : 0) + (project.sideFlat ? 1 : 0);
  const numColoredFlats  = project.coloredFlats?.length ?? 0;
  const numLooks         = project.looks?.length ?? 0;
  const numDetails       = project.details?.length ?? 0;
  const numPatterns      = project.patterns?.length ?? 0;
  const numMaterials     = project.materials?.length ?? 0;
  const numTechPacks     = project.techPacks?.length ?? 0;
  const numFinalProducts = project.finalProduct?.length ?? 0;

  const sectionHasData: Record<string, boolean> = {
    sketches:         numSketches > 0,
    digitalRendering: !!project.digitalRendering?.url,
    flats:            numFlats > 0,
    looks:            numLooks > 0,
    details:          numDetails > 0,
    patterns:         numPatterns > 0,
    materials:        numMaterials > 0,
    techpack:         numTechPacks > 0,
    final:            numFinalProducts > 0,
  };

  const activeSections = SECTIONS.filter(({ id }) => sectionHasData[id]);

  const [activeFlat, setActiveFlat] = useState<string>("front");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(activeSections[0]?.id ?? "");

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
    setModal((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.items.length } : prev));
  }, []);

  const goPrev = useCallback(() => {
    setModal((prev) => (prev ? { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length } : prev));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")      closeModal();
      if (e.key === "ArrowRight")  goNext();
      if (e.key === "ArrowLeft")   goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeModal, goNext, goPrev]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      if (!sectionHasData[id]) return;
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sketchItems: ImageGridItem[]       = (project.sketches ?? []).filter((s) => s?.url).map((s, i) => ({ url: s.url, title: `Sketch ${i + 1}` }));
  const coloredFlatItems: ImageGridItem[]  = (project.coloredFlats ?? []).filter((c) => c?.image?.url).map((c) => ({ url: c.image.url, title: c.title, description: c.description }));
  const looksItems: ImageGridItem[]        = (project.looks ?? []).filter((l) => l?.image?.url).map((l, i) => ({ url: l.image.url, title: l.title || `Look ${i + 1}`, description: l.description }));
  const detailItems: ImageGridItem[]       = (project.details ?? []).filter((d) => d?.image?.url).map((d) => ({ url: d.image.url, title: d.title, description: d.description }));
  const patternItems: ImageGridItem[]      = (project.patterns ?? []).filter((p) => p?.url).map((p, i) => ({ url: p.url, title: `Pattern ${i + 1}` }));
  const materialItems: ImageGridItem[]     = (project.materials ?? []).filter((m) => m?.image?.url).map((m) => ({ url: m.image.url, title: m.title, description: m.description }));
  const techPackItems: ImageGridItem[]     = (project.techPacks ?? []).filter((t) => t?.image?.url).map((t, i) => ({ url: t.image.url, title: t.title, description: t.description }));
  const finalProductItems: ImageGridItem[] = (project.finalProduct ?? []).filter((f) => f?.url).map((f, i) => ({ url: f.url, title: `Final Product ${i + 1}` }));

  const techPackInfo: TechPackInfo = project.techPackHeader;

  return (
    <>
      <ProjectModal
        modal={modal}
        modalVisible={modalVisible}
        closeModal={closeModal}
        goNext={goNext}
        goPrev={goPrev}
      />
      <main className={styles.pageWrapper}>
        <div className={styles.pageLayout}>
          <ProjectSidebar
            projectTitle={project.title}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            scrollTo={scrollTo}
            sections={activeSections}
          />

          <div className={styles.pageContainer}>
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInVariant}
              className={styles.mainHeader}
            >
              <h1>{project.title}</h1>
              <p>{project.description}</p>
            </motion.div>

            {sectionHasData.sketches && (
              <motion.div id="sketches" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Initial Sketches <span>{numSketches}</span></h2>
                <ImageGrid items={sketchItems} variant="sketches" onOpen={openModal} />
              </motion.div>
            )}

            {project.digitalRendering?.url && (
              <motion.div id="digitalRendering" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Digital Rendering</h2>
                <div
                  className={styles.digitalRendering}
                  onClick={() => openModal(
                    project.digitalRendering.url,
                    "Digital Rendering",
                    [{ url: project.digitalRendering.url, title: "Digital Rendering" }],
                    0
                  )}
                >
                  <Image
                    src={project.digitalRendering.url}
                    alt="Digital Rendering"
                    width={1600}
                    height={1200}
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                </div>
              </motion.div>
            )}

            {sectionHasData.flats && (
              <motion.div id="flats" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Technical Flats <span>{numFlats}</span></h2>
                <div className={styles.flatViewSelector}>
                  <button onClick={() => setActiveFlat("front")} aria-pressed={activeFlat === "front"} disabled={!project.frontFlat?.url}>Front</button>
                  <button onClick={() => setActiveFlat("back")}  aria-pressed={activeFlat === "back"}  disabled={!project.backFlat?.url}>Back</button>
                  <button onClick={() => setActiveFlat("side")}  aria-pressed={activeFlat === "side"}  disabled={!project.sideFlat?.url}>Side</button>
                  {project.frontFlat?.url && project.backFlat?.url && (
                    <button onClick={() => setActiveFlat("both")} aria-pressed={activeFlat === "both"}>Both</button>
                  )}
                </div>
                <div className={styles.flatDisplay}>
                  {activeFlat === "both" ? (
                    <div className={styles.flatSideBySide}>
                      <div className={styles.flat}>
                        <h3>Front View</h3>
                        <Image src={project.frontFlat.url} alt="Front Flat" width={1000} height={1000}
                               onClick={() => openModal(project.frontFlat.url, "Front Flat", [{ url: project.frontFlat.url, title: "Front Flat" }], 0)}
                               placeholder="blur"
                               blurDataURL={BLUR_DATA_URL}
                        />
                      </div>
                      <div className={styles.flat}>
                        <h3>Back View</h3>
                        <Image src={project.backFlat.url} alt="Back Flat" width={1000} height={1000}
                               onClick={() => openModal(project.backFlat.url, "Back Flat", [{ url: project.backFlat.url, title: "Back Flat" }], 0)}
                               placeholder="blur"
                               blurDataURL={BLUR_DATA_URL}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.flat}>
                      {activeFlat === "front" && project.frontFlat?.url && <>
                        <h3>Front View</h3>
                        <Image src={project.frontFlat.url} alt="Front Flat" width={1000} height={1000}
                               onClick={() => openModal(project.frontFlat.url, "Front Flat", [{ url: project.frontFlat.url, title: "Front Flat" }], 0)}
                               placeholder="blur"
                               blurDataURL={BLUR_DATA_URL}
                        />
                      </>}
                      {activeFlat === "back" && project.backFlat?.url && <>
                        <h3>Back View</h3>
                        <Image src={project.backFlat.url} alt="Back Flat" width={1000} height={1000}
                               onClick={() => openModal(project.backFlat.url, "Back Flat", [{ url: project.backFlat.url, title: "Back Flat" }], 0)}
                               placeholder="blur"
                               blurDataURL={BLUR_DATA_URL}
                        />
                      </>}
                      {activeFlat === "side" && project.sideFlat?.url && <>
                        <h3>Side View</h3>
                        <Image src={project.sideFlat.url} alt="Side Flat" width={1000} height={1000}
                               onClick={() => openModal(project.sideFlat.url, "Side Flat", [{ url: project.sideFlat.url, title: "Side Flat" }], 0)}
                               placeholder="blur"
                               blurDataURL={BLUR_DATA_URL}
                        />
                      </>}
                    </div>
                  )}
                </div>

                {numColoredFlats > 0 && (
                  <div className={styles.coloredFlatsSubsection}>
                    <h3 className={styles.subsectionHeading}>
                      Colored Flats <span>{numColoredFlats}</span>
                    </h3>
                    <ImageGrid items={coloredFlatItems} variant="materials" onOpen={openModal} />
                  </div>
                )}
              </motion.div>
            )}

            {sectionHasData.looks && (
              <motion.div id="looks" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Looks <span>{numLooks}</span></h2>
                <ImageGrid items={looksItems} variant="looks" onOpen={openModal} />
              </motion.div>
            )}

            {sectionHasData.details && (
              <motion.div id="details" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Details <span>{numDetails}</span></h2>
                <ImageGrid items={detailItems} variant="grid" onOpen={openModal} />
              </motion.div>
            )}

            {sectionHasData.patterns && (
              <motion.div id="patterns" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Pattern Drafting <span>{numPatterns}</span></h2>
                <ImageGrid items={patternItems} variant="patterns" onOpen={openModal} />
              </motion.div>
            )}

            {sectionHasData.materials && (
              <motion.div id="materials" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Materials List <span>{numMaterials}</span></h2>
                <ImageGrid items={materialItems} variant="materials" onOpen={openModal} />
              </motion.div>
            )}

            {sectionHasData.techpack && (
              <motion.div id="techpack" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Tech Pack <span>{numTechPacks}</span></h2>
                <div className={styles.techPackLayout}>
                  {techPackInfo && <aside className={styles.techPackInfo}>
                    {Object.entries(techPackInfo).map(([label, value]) => (
                      <div key={label} className={styles.techPackInfoItem}>
                      <span className={styles.techPackLabel}>
                        {label
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, c => c.toUpperCase())}
                      </span>
                        <span className={styles.techPackValue}>{value}</span>
                      </div>
                    ))}
                  </aside>}
                  <div className={styles.techPackContent}>
                    <ImageGrid items={techPackItems} variant="techpack" onOpen={openModal} />
                  </div>
                </div>
              </motion.div>
            )}

            {sectionHasData.final && (
              <motion.div id="final" className={styles.section} variants={fadeInVariant} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <h2>Final Product <span>{numFinalProducts}</span></h2>
                <ImageGrid items={finalProductItems} variant="finalProduct" onOpen={openModal} />
              </motion.div>
            )}

            {/* Project Footer Navigation */}
            <motion.div
              className={styles.projectFooter}
              variants={fadeInVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {prevProject ? (
                <Link href={`/portfolio/${prevProject.slug}`} className={styles.navButton}>
                  <span className={styles.arrow}>←</span>
                  {prevProject.title}
                </Link>
              ) : <span />}

              <Link href="/portfolio" className={styles.exploreButton}>
                All Projects
              </Link>

              {nextProject ? (
                <Link href={`/portfolio/${nextProject.slug}`} className={styles.navButton}>
                  {nextProject.title}
                  <span className={styles.arrow}>→</span>
                </Link>
              ) : <span />}
            </motion.div>
          </div>
        </div>
      </main>
    </>
  );
}
