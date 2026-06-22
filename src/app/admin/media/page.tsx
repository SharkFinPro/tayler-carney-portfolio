import { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getAssets } from "@/lib/getAssets";
import MediaGallery from "./MediaGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Media",
  robots: { index: false, follow: false },
};

export default async function MediaPage() {
  if (!(await isAuthed())) redirect("/admin/login");
  const assets = await getAssets();
  return <MediaGallery initialAssets={assets} />;
}
