import Link from "next/link";
import styles from "./Footer.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import getSiteData from "@/components/SiteData";
import { resolveResumeAsset } from "@/lib/resume";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Atelier",   href: "/atelier" },
  { label: "About",     href: "/about" },
  { label: "Contact",   href: "/contact" },
];

export default async function Footer() {
  const { global } = await getSiteData();
  const resume = await resolveResumeAsset(global.resumeAssetId);

  // An unset handle must not render an icon linking to a bare
  // "linkedin.com/in/" — filter the channel out entirely instead.
  const socials = [
    {
      label: "LinkedIn",
      handle: global.linkedInHandle,
      href: `https://www.linkedin.com/in/${global.linkedInHandle}`,
      icon: faLinkedin,
    },
    {
      label: "Instagram",
      handle: global.instagramHandle,
      href: `https://instagram.com/${global.instagramHandle}`,
      icon: faInstagram,
    },
  ].filter((s) => s.handle);

  return (
    <footer className={styles.wrapper}>
      <div className={styles.container}>

        {/* Brand + socials — left cluster */}
        <div className={styles.brand}>
          <Link href="/" className={styles.brandName}>{global.displayName}</Link>
          <p className={styles.brandSub}>{global.focus}</p>
          <div className={styles.socials}>
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialLink}
                aria-label={s.label}
              >
                <FontAwesomeIcon icon={s.icon} />
              </a>
            ))}
          </div>
          {resume && (
            <a
              href={resume.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.resumeLink}
              title={resume.name}
            >
              Resume ↗
            </a>
          )}
        </div>

        {/* Spacer — empty middle column keeps nav pushed right */}
        <div />

        {/* Quick links — right */}
        <nav className={styles.nav} aria-label="Footer navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
        </nav>

      </div>

      <div className={styles.bottom}>
        <p>&copy; {new Date().getFullYear()} {global.displayName}. All rights reserved.</p>
      </div>
    </footer>
  );
}