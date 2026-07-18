import styles from "./Skeleton.module.scss";

interface PageSkeletonProps {
  // "index" echoes the eyebrow + serif title header used by /portfolio and
  // /atelier; "project" echoes the two-column title + description header of a
  // project case study.
  variant: "index" | "project";
}

// Static, accessible loading placeholder rendered by route `loading.tsx` files
// while the server fetches CMS content. Layout mirrors the real header so the
// content swap doesn't cause a jump.
export default function PageSkeleton({ variant }: PageSkeletonProps) {
  return (
    <div className={styles.wrapper} role="status" aria-label="Loading" aria-live="polite">
      <span className="srOnly">Loading…</span>
      <div className={styles.container}>
        {variant === "index" ? (
          <div className={styles.indexHeader}>
            <span className={`${styles.bar} ${styles.eyebrow}`} aria-hidden="true" />
            <span className={`${styles.bar} ${styles.title}`} aria-hidden="true" />
          </div>
        ) : (
          <div className={styles.projectHeader}>
            <span className={`${styles.bar} ${styles.projectTitle}`} aria-hidden="true" />
            <div className={styles.lines} aria-hidden="true">
              <span className={`${styles.bar} ${styles.line}`} />
              <span className={`${styles.bar} ${styles.line}`} />
              <span className={`${styles.bar} ${styles.line}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
