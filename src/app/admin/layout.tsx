import { ReactNode } from "react";
import AdminNav from "./AdminNav";
import getSiteData from "@/components/SiteData";
import styles from "./admin.module.scss";

/** "Tayler Carney" -> "TC"; falls back to the first two characters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Shared shell for every /admin/* route. AdminNav hides itself on the login
// screen, so unauthenticated visitors still get a clean, chrome-free page.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The admin shell used to hardcode "Tayler Carney" and a "TC" monogram,
  // while the value it should show sits in the same settings page two clicks
  // away. getSiteData is request-deduped, so reading it here is free.
  const { global } = await getSiteData();

  return (
    <div className={styles.shell}>
      <AdminNav displayName={global.displayName} monogram={initials(global.displayName)} />
      <div className={styles.shellBody}>{children}</div>
    </div>
  );
}
