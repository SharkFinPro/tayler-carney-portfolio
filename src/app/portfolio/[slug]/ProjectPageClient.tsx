"use client";
import styles from "./Project.module.scss";
import Image from "next/image";
import { useEffect, useState } from "react";

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

export default function ProjectPageClient({ project }: ProjectPageClientProps) {

  const [activeFlat, setActiveFlat] = useState<string>("front");
  const [modalImage, setModalImage] = useState<{ src: string; title: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = (src: string, title: string) => {
    setModalImage({ src, title });
    // small delay lets the element mount before the transition starts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  };

  const closeModal = () => {
    setModalVisible(false);
    // wait for the CSS transition to finish before unmounting
    setTimeout(() => setModalImage(null), 300);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (modalImage) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [modalImage]);

  const numSketches = project.sketches.length;
  const numFlats = (project.frontFlat ? 1 : 0) +
                        (project.backFlat ? 1 : 0) +
                        (project.sideFlat ? 1 : 0);
  const numDetails = project.details ? project.details.length : 0;
  const numPatterns = project.patterns ? project.patterns.length : 0;
  const numMaterials = project.materials ? project.materials.length : 0;
  const numTechPacks = project.techPack ? project.techPack.length : 0;
  const numFinalProducts = project.finalProduct ? project.finalProduct.length : 0;

  return (
    <>
      <main className={styles.pageWrapper}>
        {modalImage && (
          <div
            className={`${styles.modalOverlay} ${modalVisible ? styles.visible : ""}`}
            onClick={closeModal}
          >
            <div
              className={styles.modalInner}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <span>{modalImage.title}</span>
                <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  Close
                </button>
              </div>
              <div className={styles.modalBody}>
                <Image src={modalImage.src} alt={modalImage.title} width={1600} height={900} />
              </div>
            </div>
          </div>
        )}

        <div className={styles.pageContainer}>
          <div className={styles.mainHeader}>
            <h1>{project.title}</h1>
            <p>{project.description}</p>
          </div>

          <div className={styles.section}>
            <h2>Initial Sketches <span>{numSketches}</span></h2>
            <div className={styles.sketchesContainer}>
              {project.sketches.map((sketch, index) => (
                <div
                  key={index}
                  className={styles.sketch}
                  onClick={() => openModal(sketch.url, `Sketch ${index + 1}`)}
                >
                  <Image
                    src={sketch.url}
                    alt={`Sketch ${index + 1}`}
                    width={1000}
                    height={1000}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Technical Flats <span>{numFlats}</span></h2>

            <div className={styles.flatViewSelector}>
              <button
                onClick={() => setActiveFlat("front")}
                aria-pressed={activeFlat === "front"}
                disabled={!project.frontFlat}
              >
                Front
              </button>
              <button
                onClick={() => setActiveFlat("back")}
                aria-pressed={activeFlat === "back"}
                disabled={!project.backFlat}
              >
                Back
              </button>
              <button
                onClick={() => setActiveFlat("side")}
                aria-pressed={activeFlat === "side"}
                disabled={!project.sideFlat}
              >
                Side
              </button>
            </div>

            <div>
              <div
                className={styles.flat}
              >
                {(activeFlat == "front" && project.frontFlat && <>
                  <h3>Front View</h3>
                  <Image
                    src={project.frontFlat.url}
                    alt={"Front Flat"}
                    width={1000}
                    height={1000}
                    onClick={() => openModal(project.frontFlat.url, "Front Flat" )}
                  />
                </>)}
                {(activeFlat == "back" && project.backFlat && <>
                  <h3>Back View</h3>
                  <Image
                    src={project.backFlat.url}
                    alt={"Back Flat"}
                    width={1000}
                    height={1000}
                    onClick={() => openModal(project.backFlat.url, "Back Flat")}
                  />
                </>)}
                {(activeFlat == "side" && project.sideFlat && <>
                  <h3>Side View</h3>
                  <Image
                    src={project.sideFlat.url}
                    alt={"Side Flat"}
                    width={1000}
                    height={1000}
                    onClick={() => openModal(project.sideFlat.url, "Side Flat")}
                  />
                </>)}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2>Details <span>{numDetails}</span></h2>

            <div className={styles.detailsContainer}>
              {project.details.map((detail, index) => (
                <div
                  key={index}
                  className={styles.detail}
                  onClick={() => openModal(detail.image.url, detail.title)}
                >
                  <h3>{detail.title}</h3>
                  <p>{detail.description}</p>
                  <Image
                    src={detail.image.url}
                    alt={`Detail ${index + 1}`}
                    width={1000}
                    height={1000}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Pattern Drafting <span>{numPatterns}</span></h2>

            <div>
              {project.patterns && project.patterns.map((pattern, index) => (
                <Image
                  key={index}
                  src={pattern.url}
                  alt={`Pattern ${index + 1}`}
                  width={100}
                  height={100}
                />
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Materials List <span>{numMaterials}</span></h2>

            <div>
              {project.materials.map((material, index) => (
                <div key={index}>
                  <h3>{material.title}</h3>
                  <p>{material.description}</p>
                  <Image
                    src={material.image.url}
                    alt={`Material ${index + 1}`}
                    width={100}
                    height={100}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Tech Pack <span>{numTechPacks}</span></h2>

            <div className={styles.techPackContainer}>
              {project.techPack.map((techPack, index) => (
                <div
                  key={index}
                  className={styles.techPack}
                  onClick={() => openModal(techPack.url, `Tech Pack ${index + 1}`)}
                >
                  <Image
                    src={techPack.url}
                    alt={`Tech Pack ${index + 1}`}
                    width={1000}
                    height={1000}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Final Product <span>{numFinalProducts}</span></h2>

            <div className={styles.finalProductContainer}>
              {project.finalProduct.map((finalProduct, index) => (
                <div
                  key={index}
                  className={styles.finalProduct}
                  onClick={() => openModal(finalProduct.url, `Final Product ${index + 1}`)}
                >
                  <Image
                    src={finalProduct.url}
                    alt={`Final Product ${index + 1}`}
                    width={1000}
                    height={1000}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}