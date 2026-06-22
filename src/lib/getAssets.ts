// Media Library data layer. Reads via the mutation token so unpublished
// (draft) assets are visible to admins, and derives a publish status from
// documentInStages.
import { cmsQueryAuthed } from "@/lib/cms";

export type MediaStatus = "published" | "draft";

export interface MediaAsset {
  id: string;
  url: string;
  fileName: string;
  /** Custom Asset field: human-friendly display name. */
  title?: string;
  /** Custom Asset field: alt text for accessibility. */
  altText?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  createdAt: string;
  updatedAt: string;
  status: MediaStatus;
}

const ASSET_FIELDS = `
  id
  fileName
  title
  altText
  url
  mimeType
  width
  height
  size
  createdAt
  updatedAt
  documentInStages(stages: [PUBLISHED]) { stage }
`;

const ASSETS_QUERY = `
  query MediaAssets {
    assets(stage: DRAFT, first: 100, orderBy: createdAt_DESC) {
      ${ASSET_FIELDS}
    }
  }
`;

const ASSET_BY_ID_QUERY = `
  query MediaAsset($id: ID!) {
    asset(stage: DRAFT, where: { id: $id }) {
      ${ASSET_FIELDS}
    }
  }
`;

interface RawAsset {
  id: string;
  fileName: string;
  title?: string;
  altText?: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  createdAt: string;
  updatedAt: string;
  documentInStages?: { stage: string }[];
}

function toMediaAsset(a: RawAsset): MediaAsset {
  return {
    id: a.id,
    url: a.url,
    fileName: a.fileName,
    title: a.title ?? undefined,
    altText: a.altText ?? undefined,
    mimeType: a.mimeType ?? undefined,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    size: a.size ?? undefined,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    status: a.documentInStages?.some((s) => s.stage === "PUBLISHED") ? "published" : "draft",
  };
}

/** Fetch all media assets (draft + published), newest first. */
export async function getAssets(): Promise<MediaAsset[]> {
  const data = await cmsQueryAuthed(ASSETS_QUERY);
  const assets: RawAsset[] = data?.assets ?? [];
  return assets.map(toMediaAsset);
}

/** Fetch a single asset by id at the DRAFT stage (resolves freshly uploaded assets). */
export async function getAssetById(id: string): Promise<MediaAsset | null> {
  const data = await cmsQueryAuthed(ASSET_BY_ID_QUERY, { id });
  const raw: RawAsset | null = data?.asset ?? null;
  return raw ? toMediaAsset(raw) : null;
}
