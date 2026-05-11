import { Metadata } from "next";
import styles from "./Contact.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import getSiteData from "@/components/SiteData"

export const metadata: Metadata = {
  title: "Contact"
};

// ─────────────────────────────────────────────────────────────────────────────
// Content — swap for CMS fetch when ready
// ─────────────────────────────────────────────────────────────────────────────

const pageData = {
  eyebrow: "Contact",
  headline: "Let's Work Together.",
  subtext:
    "Open for internships, collaborations, and conversations about fashion, design, and merchandising.",
  availability: "Available for opportunities"
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function ContactPage() {
  const { eyebrow, headline, subtext, availability } = pageData;

  const siteData = await getSiteData();

  const socials = [
    {
      title: "LinkedIn",
      handle: `linkedin.com/in/${siteData.linkedInHandle}`,
      href: `https://www.linkedin.com/in/${siteData.linkedInHandle}`,
      icon: faLinkedin,
    },
    {
      title: "Instagram",
      handle: `@${siteData.instagramHandle}`,
      href: `https://instagram.com/${siteData.instagramHandle}`,
      icon: faInstagram,
    },
  ];

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>
        <div className={styles.grid}>

          {/* ── Left panel ─────────────────────────────────────────────── */}
          <div className={styles.left}>
            <div className={styles.leftTop}>
              <span className={styles.eyebrow}>{eyebrow}</span>
              <h1 className={styles.headline}>{headline}</h1>
              <p className={styles.subtext}>{subtext}</p>
            </div>
            <div className={styles.availability}>
              <span className={styles.availabilityDot} aria-hidden="true" />
              <span className={styles.availabilityText}>{availability}</span>
            </div>
          </div>

          {/* ── Right panel ────────────────────────────────────────────── */}
          <div className={styles.right}>

            <div>
              <span className={styles.sectionLabel}>Email</span>
              <a href={`mailto:${siteData.email}`} className={styles.emailButton}>
                <div className={styles.emailButtonInner}>
                  <FontAwesomeIcon icon={faEnvelope} className={styles.emailButtonIcon} />
                  <span className={styles.emailButtonText}>Send an Email</span>
                  <span className={styles.emailButtonArrow}>↗</span>
                </div>
              </a>
              <span className={styles.emailAddress}>{siteData.email}</span>
            </div>

            <div>
              <span className={styles.sectionLabel}>Online</span>
              <div className={styles.socialList}>
                {socials.map((s) => {
                  return (
                    <a
                      key={s.title}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.socialCard}
                    >
                      <div className={styles.socialCardInner}>
                        <FontAwesomeIcon icon={s.icon} className={styles.socialIcon} />
                        <div className={styles.socialCardInfo}>
                          <span className={styles.socialCardTitle}>{s.title}</span>
                          <span className={styles.socialCardHandle}>{s.handle}</span>
                        </div>
                      </div>
                      <span className={styles.socialArrow}>↗</span>
                    </a>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}