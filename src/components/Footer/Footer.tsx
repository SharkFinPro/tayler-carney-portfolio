import styles from "./Footer.module.scss";

export default function Footer() {
  return (
    <footer className={styles.wrapper}>
      <div className={styles.container}>

      </div>
      <div className={styles.bottom}>
        <p>&copy; 2026 <span>Tayler Carney</span>.</p>
      </div>
    </footer>
  );
}