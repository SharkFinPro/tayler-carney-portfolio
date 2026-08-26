import { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import getSiteData from "@/components/SiteData";
import { getAssetById } from "@/lib/getAssets";
import SettingsForm, { type ResumeDisplay } from "./SettingsForm";
import styles from "../admin.module.scss";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site Settings",
  robots: { index: false, follow: false },
};

export default async function SiteSettings() {
  if (!(await isAuthed())) redirect("/admin/login");

  const { id, global, seo } = await getSiteData();

  // Resolve the referenced assets for display. This is the authed read, so a
  // still-draft file shows up too; null means unset or deleted.
  async function displayAsset(assetId: string): Promise<ResumeDisplay | null> {
    if (!assetId) return null;
    const asset = await getAssetById(assetId).catch(() => null);
    if (!asset) return null;
    return {
      url: asset.url,
      name: asset.title?.trim() || asset.fileName.replace(/\.[^.]+$/, ""),
    };
  }

  const [resume, ogImage] = await Promise.all([
    displayAsset(global.resumeAssetId),
    displayAsset(global.ogImageAssetId),
  ]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Control Room</span>
        <h1 className={styles.title}>Site Settings</h1>
        <p className={styles.intro}>
          These details appear in multiple places across the site (footer, contact page,
          social links, and search/social previews), so they&apos;re edited here rather
          than inline.
        </p>
      </div>

      <SettingsForm
        id={id}
        initialGlobal={global}
        initialSeo={seo}
        initialResume={resume}
        initialOgImage={ogImage}
      />
    </div>
  );
}
