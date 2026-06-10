import { Metadata } from "next";
import Image from "next/image";
import styles from "./Atelier.module.scss";
import { AnimatedSection } from "@/components/AnimatedSection";

export const metadata: Metadata = {
  title: "Atelier"
};

export const dynamic = "force-dynamic";

const ATELIERS_QUERY = `
  query Ateliers {
    ateliers {
      title
      description
      image {
        title
        description
        image {
          url
        }
      }
    }
  }
`;

interface AtelierImageEntry {
  title: string;
  description: string;
  image: {
    url: string;
  };
}

interface Atelier {
  title: string;
  description: string;
  image: AtelierImageEntry[];
}

async function getAteliers(): Promise<Atelier[]> {
  const response = await fetch(process.env.CMS_ENDPOINT as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.CMS_TOKEN,
    },
    body: JSON.stringify({ query: ATELIERS_QUERY }),
  });
  const json = await response.json();
  return json.data.ateliers;
}

export default async function Atelier() {
  const ateliers = await getAteliers();

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>

        <AnimatedSection>
          <div className={styles.header}>
            <span className={styles.headerEyebrow}>Studio Process</span>
            <h1 className={styles.headerTitle}>Atelier</h1>
          </div>
        </AnimatedSection>

        {ateliers.length === 0 ? (
          <p className={styles.empty}>No entries found</p>
        ) : (
          <div className={styles.entries}>
            {ateliers.map((atelier, i) => (
              <AnimatedSection key={i} delay={i * 0.05}>
                <article className={styles.entry}>

                  <div className={styles.entryText}>
                    <span className={styles.entryIndex}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className={styles.entryTitle}>{atelier.title}</h2>
                    {atelier.description && (
                      <p className={styles.entryDesc}>{atelier.description}</p>
                    )}
                    {atelier.image.length > 0 && (
                      <span className={styles.entryCount}>
                        {atelier.image.length} {atelier.image.length === 1 ? "image" : "images"}
                      </span>
                    )}
                  </div>

                  {atelier.image.length > 0 && (
                    <div className={styles.imageStrip}>
                      {atelier.image.map((entry, j) => (
                        <figure key={j} className={styles.imageItem}>
                          <div className={styles.imageWrap}>
                            <Image
                              src={entry.image.url}
                              alt={entry.title ?? atelier.title}
                              width={0}
                              height={0}
                              sizes="(max-width: 860px) 90vw, 40vw"
                              className={styles.imageNatural}
                            />
                          </div>
                          {(entry.title || entry.description) && (
                            <figcaption className={styles.imageCaption}>
                              {entry.title && (
                                <span className={styles.imageCaptionTitle}>{entry.title}</span>
                              )}
                              {entry.description && (
                                <span className={styles.imageCaptionDesc}>{entry.description}</span>
                              )}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}

                </article>
              </AnimatedSection>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
