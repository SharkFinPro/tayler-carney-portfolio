import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDiagramProject,
  faImages,
  faGear,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { isAuthed } from "@/lib/auth";
import { logout } from "./actions";
import styles from "./admin.module.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDashboard() {
  if (!(await isAuthed())) redirect("/admin/login");

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Control Room</span>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.intro}>
          Manage everything that powers the site from here. Most content is edited inline
          on the page it lives on — open a project and use <strong>Edit page layout</strong>,
          or edit titles and descriptions directly on the page.
        </p>
      </div>

      <div className={styles.grid}>
        <Link href="/portfolio" className={styles.panel}>
          <span className={styles.panelIcon}>
            <FontAwesomeIcon icon={faDiagramProject} />
          </span>
          <span className={styles.panelIndex}>01 / Content</span>
          <h2 className={styles.panelTitle}>Projects</h2>
          <p className={styles.panelBody}>
            Browse projects, then enter a project to edit its block layout, title, and description.
          </p>
          <span className={styles.panelArrow}>
            Open Portfolio <FontAwesomeIcon icon={faArrowRight} />
          </span>
        </Link>

        <Link href="/admin/media" className={styles.panel}>
          <span className={styles.panelIcon}>
            <FontAwesomeIcon icon={faImages} />
          </span>
          <span className={styles.panelIndex}>02 / Media</span>
          <h2 className={styles.panelTitle}>Media Library</h2>
          <p className={styles.panelBody}>
            Upload, crop, rename, publish, and organize image assets used across the site.
          </p>
          <span className={styles.panelArrow}>
            Open Media Library <FontAwesomeIcon icon={faArrowRight} />
          </span>
        </Link>

        <Link href="/admin/settings" className={styles.panel}>
          <span className={styles.panelIcon}>
            <FontAwesomeIcon icon={faGear} />
          </span>
          <span className={styles.panelIndex}>03 / Settings</span>
          <h2 className={styles.panelTitle}>Site Settings</h2>
          <p className={styles.panelBody}>
            Edit site-wide details — display name, tagline, email, social handles, and
            search/social previews.
          </p>
          <span className={styles.panelArrow}>
            Open Site Settings <FontAwesomeIcon icon={faArrowRight} />
          </span>
        </Link>

        <section className={`${styles.panel} ${styles.panelStatic}`}>
          <span className={styles.panelIndex}>04 / Session</span>
          <h2 className={styles.panelTitle}>Session</h2>
          <p className={styles.panelBody}>
            You&apos;re signed in to admin mode on this device.
          </p>
          <form action={logout}>
            <button type="submit" className={styles.logout}>
              Sign out
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
