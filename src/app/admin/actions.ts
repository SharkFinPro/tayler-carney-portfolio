"use server";

import { redirect } from "next/navigation";
import { checkAdminKey } from "@/lib/session";
import { setSession, clearSession } from "@/lib/auth";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const key = String(formData.get("key") ?? "");
  if (!(await checkAdminKey(key))) {
    return { error: "Incorrect key." };
  }
  await setSession();
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/");
}
