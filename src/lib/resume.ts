// Resolves the resume Asset reference stored in `global.resumeAssetId`.
//
// The resume is stored as an asset *id*, not a URL, and resolved fresh on every
// render — so renaming or re-uploading the asset in the Media Library is
// reflected everywhere it appears, with no stale copies. Server-only (imports
// the CMS layer); returns null when the id is unset, the asset is gone, or it
// is unpublished — callers hide the download links in that case.

import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { rethrowIfControlFlow } from "@/lib/nextErrors";

export type ResumeAsset = {
  url: string;
  /** Media Library title, falling back to the file name without extension. */
  name: string;
};

const RESUME_ASSET_QUERY = `
  query ResumeAsset($id: ID!) {
    asset(where: { id: $id }) {
      url
      fileName
      title
    }
  }
`;

export async function resolveResumeAsset(assetId: string): Promise<ResumeAsset | null> {
  if (!assetId) return null;
  try {
    const data = await cmsRead(RESUME_ASSET_QUERY, { id: assetId }, { tags: [CACHE_TAGS.siteData] });
    const asset = data?.asset as { url?: string; fileName?: string; title?: string } | null;
    if (!asset?.url) return null;
    const base = (asset.fileName ?? "").replace(/\.[^.]+$/, "");
    return { url: asset.url, name: asset.title?.trim() || base || "Resume" };
  } catch (error) {
    // Never swallow Next's control-flow signals — this runs in the Footer, and
    // therefore inside the root layout, where eating a DynamicServerError would
    // leave the route marked static.
    rethrowIfControlFlow(error);

    // A broken reference should never take a page down — just hide the link.
    return null;
  }
}
