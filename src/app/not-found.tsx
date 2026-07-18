import Link from "next/link";
import { Metadata } from "next";
import styles from "./NotFound.module.scss";

export const metadata: Metadata = {
  title: "Not Found",
};

export default function NotFound() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>
        <div className={styles.panel}>
          <span className={styles.eyebrow}>Ref. Not Found — 404</span>
          <p className={styles.code}>404</p>
          <p className={styles.message}>
            This page isn&rsquo;t in the archive. The reference may have been
            moved, retired, or never catalogued. Return to the index or browse
            the portfolio.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={styles.primary}>
              Home
              <span className={styles.arrow}>&#8599;</span>
            </Link>
            <Link href="/portfolio" className={styles.secondary}>
              Portfolio
              <span className={styles.arrow}>&#8599;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
