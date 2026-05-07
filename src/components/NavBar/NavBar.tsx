import Link from "next/link";
import styles from "./NavBar.module.scss";

export default function NavBar() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>Tayler Carney</Link>
      </div>
    </header>
  );
}