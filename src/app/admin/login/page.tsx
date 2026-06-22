import { Metadata } from "next";
import LoginForm from "./LoginForm";
import styles from "./Login.module.scss";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>Restricted</span>
        <h1 className={styles.title}>Admin sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
