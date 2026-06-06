"use client";
import { Metadata } from "next";
import styles from "./Atelier.module.scss";
import { AnimatedSection } from "@/components/AnimatedSection";

export default function Atelier() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageContainer}>
        <AnimatedSection>
          <header className={styles.header}>
            <span className={styles.headerEyebrow}>Studio Process</span>
            <h1 className={styles.headerTitle}>Atelier</h1>
          </header>
        </AnimatedSection>

        <AnimatedSection>
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonInner}>
              <span className={styles.comingSoonLabel}>System Status: Pending</span>
              <h2 className={styles.comingSoonTitle}>Coming Soon</h2>
              <p className={styles.comingSoonText}>
                The atelier archive is currently being indexed.
                Experimental research and structural studies will be documented here soon.
              </p>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
