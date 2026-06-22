import { Metadata } from "next";
import styles from "./Contact.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import getSiteData from "@/components/SiteData"
import { AnimatedSection } from "@/components/AnimatedSection";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";
import ContactEditor from "./ContactEditor";

export const metadata: Metadata = {
  title: "Contact"
};

export const dynamic = "force-dynamic";

const CONTACTPAGE_QUERY = `
  query ContactPage {
    contactPages {
      id
      header
      subheader
      availabilityMessage
    }
  }
`;

async function getContactPage() {
  const data = await cmsQuery(CONTACTPAGE_QUERY);
  return data.contactPages[0];
}


export default async function ContactPage() {
  const contactPage = await getContactPage();

  const siteData = await getSiteData();

  const isAdmin = await isAuthed();

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
        <AnimatedSection>
          <div className={styles.grid}>

            {/* ── Left panel ─────────────────────────────────────────────── */}
            <div className={styles.left}>
              <ContactEditor
                id={contactPage.id}
                header={contactPage.header}
                subheader={contactPage.subheader}
                availabilityMessage={contactPage.availabilityMessage}
                editable={isAdmin}
              />
            </div>

            {/* ── Right panel ────────────────────────────────────────────── */}
            <div className={styles.right}>

              <div className={styles.contactItem}>
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

              <div className={styles.contactItem}>
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
        </AnimatedSection>
      </div>
    </div>
  );
}
