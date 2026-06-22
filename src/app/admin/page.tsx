import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
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
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.intro}>
          Site settings live here. Most content is edited inline on the page it lives on —
          open a project and use <strong>Edit page layout</strong>, or edit titles and
          descriptions directly on the page.
        </p>
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <span className={styles.panelIndex}>01 / Content</span>
          <h2 className={styles.panelTitle}>Projects</h2>
          <p className={styles.panelBody}>
            Browse projects, then enter a project to edit its block layout, title, and description.
          </p>
          <Link href="/portfolio" className={styles.link}>
            Open Portfolio →
          </Link>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelIndex}>02 / Media</span>
          <h2 className={styles.panelTitle}>Media Library</h2>
          <p className={styles.panelBody}>
            Upload, crop, rename, publish, and organize image assets used across the site.
          </p>
          <Link href="/admin/media" className={styles.link}>
            Open Media Library →
          </Link>
        </section>

        <section className={styles.panel}>
          <span className={styles.panelIndex}>03 / Session</span>
          <h2 className={styles.panelTitle}>Session</h2>
          <p className={styles.panelBody}>Sign out of admin mode on this device.</p>
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
