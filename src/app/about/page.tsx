import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./About.module.scss";
import { RichText } from '@graphcms/rich-text-react-renderer';

export const metadata: Metadata = {
  title: "About"
};

export const dynamic = "force-dynamic";

const ABOUT_QUERY = `
  query AboutPage {
    aboutPages {
      title
      subtitle
      portrait {
        url
      }
      description {
        raw
      }
      education
      skills
      exhibitionsAwards
    }
  }
`;

async function getAbout() {
  const response = await fetch(process.env.CMS_ENDPOINT as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.CMS_TOKEN,
    },
    body: JSON.stringify({ query: ABOUT_QUERY }),
  });
  const json = await response.json();
  return json.data.aboutPages[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function About() {
  const about = await getAbout();

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className={styles.hero}>

          <div className={styles.portraitWrap}>
            <Image
              src={about.portrait.url}
              alt={about.title}
              fill
              priority
              className={styles.portraitImage}
            />
            <div className={styles.portraitBadge}>
              <span className={styles.portraitName}>{about.title}</span>
              <span className={styles.portraitTitle}>{about.subtitle}</span>
            </div>
          </div>

          <div className={styles.heroContent}>
            <span className={styles.heroContentLabel}>About</span>
            <div className={styles.bio}>
              <RichText content={about.description.raw} />
            </div>
          </div>

        </section>

        {/* ── Info grid ────────────────────────────────────────────────── */}
        <section className={styles.infoGrid}>

          <div>
            <span className={styles.colHeader}>01 / Education</span>
            <div className={styles.educationList}>
              {about.education.data.map((item, i) => (
                <div key={i} className={styles.educationItem}>
                  <h3 className={styles.educationDegree}>{item.degree}</h3>
                  <p className={styles.educationMeta}>
                    {item.institution} · {item.years}
                  </p>
                  <p className={styles.educationSpec}>{item.notes}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.skillsCol}>
            <span className={styles.skillsColHeader}>02 / Skills</span>
            <ul className={styles.skillsList}>
              {about.skills.map((skill, i) => (
                <li key={i} className={styles.skillItem}>
                  <span className={styles.skillName}>{skill}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className={styles.colHeader}>03 / Exhibitions & Awards</span>
            <div className={styles.exhibitionList}>
              {about.exhibitionsAwards.data.map((item, i) => (
                <div key={i} className={styles.exhibitionItem}>
                  <span className={styles.exhibitionYear}>{item.year}</span>
                  <div>
                    <h4 className={styles.exhibitionTitle}>{item.title}</h4>
                    <p className={styles.exhibitionDesc}>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className={styles.cta}>
          <h2 className={styles.ctaHeadline}>Open for collaboration, internships, and industry connections.</h2>
          <Link href={"/contact"} className={styles.ctaButton}>
            Get in Touch
          </Link>
        </section>

      </div>
    </div>
  );
}