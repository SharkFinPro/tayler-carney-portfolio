"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login } from "../actions";
import styles from "./Login.module.scss";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.button} disabled={pending}>
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(login, undefined);

  return (
    <form action={formAction} className={styles.form}>
      <label htmlFor="admin-key" className={styles.label}>
        Admin key
      </label>
      <input
        id="admin-key"
        name="key"
        type="password"
        autoComplete="current-password"
        className={styles.input}
        aria-invalid={state?.error ? true : undefined}
        aria-describedby={state?.error ? "admin-key-error" : undefined}
      />
      {state?.error && (
        <p id="admin-key-error" className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
