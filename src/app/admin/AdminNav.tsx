"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGaugeHigh,
  faImages,
  faGear,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import styles from "./admin.module.scss";

type NavItem = { href: string; label: string; icon: IconDefinition };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: faGaugeHigh },
  { href: "/admin/media", label: "Media", icon: faImages },
  { href: "/admin/settings", label: "Settings", icon: faGear },
];

export default function AdminNav() {
  const pathname = usePathname();

  // The login screen has no session and no destinations to navigate between,
  // so the shell nav is suppressed there.
  if (pathname === "/admin/login") return null;

  return (
    <header className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/admin" className={styles.brand}>
          <span className={styles.brandMark}>TC</span>
          <span className={styles.brandText}>
            Tayler Carney
            <span className={styles.brandSub}>Control Room</span>
          </span>
        </Link>

        <nav className={styles.navLinks} aria-label="Admin sections">
          {NAV.map(({ href, label, icon }) => {
            const active =
              href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <FontAwesomeIcon icon={icon} className={styles.navIcon} />
                {label}
              </Link>
            );
          })}
        </nav>

        <Link href="/" className={styles.viewSite}>
          View site
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className={styles.viewSiteIcon} />
        </Link>
      </div>
    </header>
  );
}
