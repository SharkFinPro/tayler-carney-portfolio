// Resolves a Hygraph Asset stored as an *id* rather than a URL.
//
// Storing the id and resolving it at render time means renaming or replacing
// the asset in the Media Library propagates everywhere it appears, with no
// stale copies to hunt down. The trade-off is one extra read per referenced
// asset, which the fetch cache absorbs.
//
// Server-only (imports the CMS layer). Returns null when the id is unset, the
// asset is gone, or it is unpublished — callers hide the affordance in that
// case rather than rendering a broken link.

import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { rethrowIfControlFlow } from "@/lib/nextErrors";

export type AssetRef = {
  url: string;
  /** Media Library title, falling back to the file name without extension. */
  name: string;
};

const ASSET_QUERY = `
  query AssetRef($id: ID!) {
    asset(where: { id: $id }) {
      url
      fileName
      title
    }
  }
`;

export async function resolveAssetRef(
  assetId: string,
  fallbackName = "File"
): Promise<AssetRef | null> {
  if (!assetId) return null;

  try {
    const data = (await cmsRead(ASSET_QUERY, { id: assetId }, { tags: [CACHE_TAGS.siteData] })) as {
      asset?: { url?: string; fileName?: string; title?: string } | null;
    } | null;

    const asset = data?.asset;
    if (!asset?.url) return null;

    const base = (asset.fileName ?? "").replace(/\.[^.]+$/, "");
    return { url: asset.url, name: asset.title?.trim() || base || fallbackName };
  } catch (error) {
    // Never swallow Next's control-flow signals — this runs inside the root
    // layout via the Footer and the metadata generator.
    rethrowIfControlFlow(error);

    // A broken reference should never take a page down.
    return null;
  }
}
