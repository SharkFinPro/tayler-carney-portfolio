import { isAuthed } from "@/lib/auth";
import { logout } from "@/app/admin/actions";
import styles from "./AdminBar.module.scss";

// Admin-only bar. Renders nothing for visitors, so the public visual identity
// is unaffected.
export default async function AdminBar() {
  if (!(await isAuthed())) return null;

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Editing mode — changes publish on save</span>
      <form action={logout}>
        <button type="submit" className={styles.logout}>
          Sign out
        </button>
      </form>
    </div>
  );
}
