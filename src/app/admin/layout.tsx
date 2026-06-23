import { ReactNode } from "react";
import AdminNav from "./AdminNav";
import styles from "./admin.module.scss";

// Shared shell for every /admin/* route. AdminNav hides itself on the login
// screen, so unauthenticated visitors still get a clean, chrome-free page.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AdminNav />
      <div className={styles.shellBody}>{children}</div>
    </div>
  );
}
