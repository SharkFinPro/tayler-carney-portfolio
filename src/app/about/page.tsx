import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./About.module.scss";
import { RichText } from '@graphcms/rich-text-react-renderer';
import { AnimatedSection } from "@/components/AnimatedSection";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";
import EditableText from "@/components/EditableText";
import { resolveAlt } from "@/lib/images";

export const metadata: Metadata = {
  title: "About"
};

export const dynamic = "force-dynamic";

const ABOUT_QUERY = `
  query AboutPage {
    aboutPages {
      id
      title
      subtitle
      portrait {
        url
        altText
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
  const data = await cmsQuery(ABOUT_QUERY);
  return data.aboutPages[0];
}

export default async function About() {
  const about = await getAbout();
  const isAdmin = await isAuthed();

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>

        <AnimatedSection>
          <section className={styles.hero}>
            <div className={styles.portraitWrap}>
              <Image
                src={about.portrait.url}
                alt={resolveAlt(about.portrait.altText, about.title)}
                fill
                priority
                className={styles.portraitImage}
              />
              <div className={styles.portraitBadge}>
                <span className={styles.portraitName}>
                  <EditableText model="AboutPage" id={about.id} field="title" value={about.title} editable={isAdmin}>
                    {about.title}
                  </EditableText>
                </span>
                <span className={styles.portraitTitle}>
                  <EditableText model="AboutPage" id={about.id} field="subtitle" value={about.subtitle} editable={isAdmin}>
                    {about.subtitle}
                  </EditableText>
                </span>
              </div>
            </div>

            <div className={styles.heroContent}>
              <span className={styles.heroContentLabel}>About</span>
              <div className={styles.bio}>
                <RichText content={about.description.raw} />
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <section className={styles.infoGrid}>

            <div className={styles.col}>
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

            <div className={styles.col}>
              <span className={styles.colHeader}>03 / Exhibitions & Awards</span>
              <div className={styles.exhibitionList}>
                {about.exhibitionsAwards.data.map((item, i) => (
                  <div key={i} className={styles.exhibitionItem}>
                    <span className={styles.exhibitionYear}>{item.year}</span>
                    <div className={styles.exhibitionTitleWrap}>
                      <h4 className={styles.exhibitionTitle}>{item.title}</h4>
                      <p className={styles.exhibitionDesc}>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </section>
        </AnimatedSection>

        <AnimatedSection delay={0.4}>
          <section className={styles.cta}>
            <h2 className={styles.ctaHeadline}>Open for collaboration, internships, and industry connections.</h2>
            <Link href={"/contact"} className={styles.ctaButton}>
              Get in Touch
            </Link>
          </section>
        </AnimatedSection>

      </div>
    </div>
  );
}
