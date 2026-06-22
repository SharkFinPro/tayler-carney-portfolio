// Media Library data layer. Reads via the mutation token so unpublished
// (draft) assets are visible to admins, and derives a publish status from
// documentInStages.
import { cmsQueryAuthed } from "@/lib/cms";

export interface MediaAsset {
  id: string;
  url: string;
  fileName: string;
  mimeType?: string;
  width?: number;
  height?: number;
  title?: string;
  altText?: string;
  status: "published" | "draft";
}

const ASSETS_QUERY = `
  query MediaAssets {
    assets(stage: DRAFT, orderBy: createdAt_DESC, first: 200) {
      id
      fileName
      url
      mimeType
      width
      height
      title
      altText
      documentInStages(stages: [PUBLISHED]) { id }
    }
  }
`;

interface RawAsset {
  id: string;
  fileName: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  title?: string;
  altText?: string;
  documentInStages?: { id: string }[];
}

export async function getAssets(): Promise<MediaAsset[]> {
  const data = await cmsQueryAuthed(ASSETS_QUERY);
  const assets: RawAsset[] = data?.assets ?? [];
  return assets.map((a) => ({
    id: a.id,
    url: a.url,
    fileName: a.fileName,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    title: a.title ?? undefined,
    altText: a.altText ?? undefined,
    status: (a.documentInStages?.length ?? 0) > 0 ? "published" : "draft",
  }));
}
