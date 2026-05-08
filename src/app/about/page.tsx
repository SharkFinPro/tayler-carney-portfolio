import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./About.module.scss";

export const metadata: Metadata = {
  title: "About"
};

// ─────────────────────────────────────────────────────────────────────────────
// CMS-ready data
// Replace these with CMS fetches when you're ready to integrate.
// Shape mirrors what you'd get back from a GraphQL/REST CMS response.
// ─────────────────────────────────────────────────────────────────────────────

const pageData = {
  hero: {
    portraitUrl:
      "https://media.licdn.com/dms/image/v2/D4E03AQF2Jzh-0EIMPA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1699046617872?e=1779321600&v=beta&t=iCyWOsMwSJ-ZysSS1QQ6oO2EtpwqzcQBcbJRwQ1NleA",
    portraitAlt: "Tayler Carney portrait",
    archivalRef: "Archival Ref. TC-001",
    headline: "Designer as Architect.",
    philosophyQuote:
      "I treat the garment as a structural feat, not a trend. My work is a dialogue between the anatomical precision of architecture and the timeless weight of archival fashion.",
    bioParagraphs: [
      "Tayler Carney is a fashion design student currently exploring the intersection of structural integrity and technical precision. Her practice is grounded in the belief that clothing should be engineered with the same permanence as a building.",
      "By meticulously documenting the construction methods of historical garments, she archives the past to inform a future where fashion is both durable and conceptually rigorous. Her work focuses on high-end textiles and brutalist silhouettes.",
    ],
  },

  education: [
    {
      degree: "Honors Bachelor of Science (BS)",
      school: "Oregon State University",
      period: "2023—2027",
      specialization: "Apparel Design & Merchandising Management",
    },
    {
      degree: "High School Diploma",
      school: "Elmira High School",
      period: "2019—2023",
      specialization: "Honors Society, Softball Leadership & Coaching",
    },
  ],

  skills: [
    { name: "Fashion Show Production",      level: "Advanced" },
    { name: "Team Leadership & Coordination", level: "Advanced" },
    { name: "Event Planning",               level: "Proficient" },
    { name: "Sustainable Fashion / Upcycling", level: "Proficient" },
    { name: "Mentorship & Advising",        level: "Advanced" },
    { name: "Adobe Photoshop",              level: "Intermediate" },
    { name: "Data Analysis",               level: "Intermediate" },
  ],

  exhibitions: [
    {
      year: "2026",
      title: "OSU Fashion Show",
      description:
        "Production Director leading cross-functional teams, model coordination, and full show execution.",
    },
    {
      year: "2025",
      title: "OSU Fashion Show",
      description:
        "Production Associate supporting designers, model planning, and event coordination.",
    },
    {
      year: "2023",
      title: "Mystery Product Challenge",
      description:
        "Collaborative design project creating a new product concept from an unknown item.",
    },
  ],

  cta: {
    label: "Inquiries",
    headline: "Open for collaboration on archival research & technical design.",
    buttonLabel: "Contact Archive",
    buttonHref: "/contact",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function About() {
  const { hero, education, skills, exhibitions, cta } = pageData;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className={styles.hero}>

          {/* Left — portrait + headline */}
          <div className={styles.heroLeft}>
            <div className={styles.portrait}>
              <Image
                src={hero.portraitUrl}
                alt={hero.portraitAlt}
                fill
                priority
              />
            </div>
            <span className={styles.heroRef}>{hero.archivalRef}</span>
            <h1 className={styles.heroHeadline}>{hero.headline}</h1>
          </div>

          {/* Right — quote + bio */}
          <div className={styles.heroRight}>
            <div className={styles.philosophy}>
              <span className={styles.philosophyLabel}>Philosophy</span>
              <p className={styles.philosophyQuote}>
                &ldquo;{hero.philosophyQuote}&rdquo;
              </p>
            </div>

            <div className={styles.bio}>
              {hero.bioParagraphs.map((para, i) => (
                <p key={i} className={i === 0 ? styles.bioLead : styles.bioBody}>
                  {para}
                </p>
              ))}
            </div>
          </div>

        </section>

        {/* ── Info grid ────────────────────────────────────────────────── */}
        <section className={styles.infoGrid}>

          {/* 01 — Education */}
          <div className={styles.educationCol}>
            <span className={styles.colHeader}>01 / Education</span>
            <div className={styles.educationList}>
              {education.map((item, i) => (
                <div key={i} className={styles.educationItem}>
                  <h3 className={styles.educationDegree}>{item.degree}</h3>
                  <p className={styles.educationMeta}>
                    {item.school} · {item.period}
                  </p>
                  <p className={styles.educationSpec}>{item.specialization}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 02 — Skills */}
          <div className={styles.skillsCol}>
            <span className={styles.skillsColHeader}>02 / Technical Skills</span>
            <ul className={styles.skillsList}>
              {skills.map((skill, i) => (
                <li key={i} className={styles.skillItem}>
                  <span className={styles.skillName}>{skill.name}</span>
                  <span className={styles.skillLevel}>{skill.level}</span>
                </li>
              ))}
            </ul>
            <div className={styles.skillsFooter}>
              <span className={styles.skillsFooterIcon}>Precision Engineered</span>
            </div>
          </div>

          {/* 03 — Exhibitions */}
          <div className={styles.exhibitionsCol}>
            <span className={styles.colHeader}>03 / Exhibitions & Awards</span>
            <div className={styles.exhibitionList}>
              {exhibitions.map((item, i) => (
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
          <div>
            <span className={styles.ctaLabel}>{cta.label}</span>
            <h2 className={styles.ctaHeadline}>{cta.headline}</h2>
          </div>
          <Link href={cta.buttonHref} className={styles.ctaButton}>
            {cta.buttonLabel}
          </Link>
        </section>

      </div>
    </div>
  );
}