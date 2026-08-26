import Link from "next/link";
import Navigation from "./Navigation";
import styles from "./NavBar.module.scss";
import getSiteData from "@/components/SiteData";

export default async function NavBar() {
  const { global } = await getSiteData();

  return (
    <header className={styles.wrapper}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>{global.displayName}</Link>

        <Navigation navItems={global.navItems} />
      </div>
    </header>
  );
}