import Link from "next/link";
import styles from "./Footer.module.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkedin, faInstagram } from "@fortawesome/free-brands-svg-icons";
import getSiteData from "@/components/SiteData";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Atelier",   href: "/atelier" },
  { label: "About",     href: "/about" },
  { label: "Contact",   href: "/contact" },
];

export default async function Footer() {
  const { global } = await getSiteData();

  const socials = [
    {
      label: "LinkedIn",
      href: `https://www.linkedin.com/in/${global.linkedInHandle}`,
      icon: faLinkedin,
    },
    {
      label: "Instagram",
      href: `https://instagram.com/${global.instagramHandle}`,
      icon: faInstagram,
    },
  ];

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