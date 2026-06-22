import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { logout } from "@/app/admin/actions";
import styles from "./AdminBar.module.scss";

// Admin-only overlay pinned to the bottom of the viewport. Renders nothing for
// visitors, so the public visual identity is unaffected.
export default async function AdminBar() {
  if (!(await isAuthed())) return null;

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Admin mode</span>
      <div className={styles.actions}>
        <Link href="/admin" className={styles.link}>
          Dashboard
        </Link>
        <form action={logout}>
          <button type="submit" className={styles.logout}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
