"use server";

import { toActionError } from "@/lib/actionError";
import { isAuthed } from "@/lib/auth";
import { cmsMutate, cmsUpload, cmsQueryAuthed } from "@/lib/cms";
import { getAssets, getAssetById, type MediaAsset } from "@/lib/getAssets";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

async function requireAuth(): Promise<Err | null> {
  return (await isAuthed()) ? null : { ok: false, error: "Not authorized." };
}

// Admin-gated read for client components (e.g. AssetPicker).
export async function fetchAssets(): Promise<Ok<{ assets: MediaAsset[] }> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    return { ok: true, assets: await getAssets() };
  } catch (e) {
    return toActionError(e, "fetchAssets", "Couldn’t load the media library.");
  }
}

// Update an asset's display name / alt text. Stage-aware: only re-publishes when
// the asset is already published, so editing metadata never silently publishes a
// draft-only asset.
export async function updateAsset(
  id: string,
  fields: { title?: string; altText?: string },
  republish: boolean
): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(
      `mutation Update($id: ID!, $data: AssetUpdateInput!) {
         updateAsset(where: { id: $id }, data: $data) { id }
       }`,
      { id, data: { title: fields.title?.trim() || null, altText: fields.altText?.trim() || null } }
    );
    if (republish) {
      await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    }
    return { ok: true };
  } catch (e) {
    return toActionError(e, "updateAsset", "Couldn’t save those asset details.");
  }
}

export async function publishAsset(id: string): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return toActionError(e, "publishAsset", "Couldn’t publish that asset.");
  }
}

export async function unpublishAsset(id: string): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(`mutation Unpub($id: ID!) { unpublishAsset(where: { id: $id }, from: PUBLISHED) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return toActionError(e, "unpublishAsset", "Couldn’t unpublish that asset.");
  }
}

export async function deleteAsset(id: string): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    // Unpublish first (a published asset can't be deleted); ignore if not published.
    try {
      await cmsMutate(`mutation Unpub($id: ID!) { unpublishAsset(where: { id: $id }, from: PUBLISHED) { id } }`, { id });
    } catch {
      /* not published — fine */
    }
    await cmsMutate(`mutation Del($id: ID!) { deleteAsset(where: { id: $id }) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return toActionError(e, "deleteAsset", "Couldn’t delete that asset.");
  }
}

// Upload a new media asset (typically a client-cropped image) entirely
// server-side via Hygraph's direct-upload flow. Lands as a DRAFT; an optional
// display name is written to `title`. Polls until ingestion populates `size` so
// the returned asset renders immediately. Returns the full asset for the gallery.
export async function uploadAsset(formData: FormData): Promise<Ok<{ asset: MediaAsset }> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  const rawTitle = formData.get("title");
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const rawAlt = formData.get("altText");
  const altText = typeof rawAlt === "string" ? rawAlt.trim() : "";

  try {
    const { id } = await cmsUpload(file);

    if (title || altText) {
      await cmsMutate(
        `mutation Update($id: ID!, $data: AssetUpdateInput!) { updateAsset(where: { id: $id }, data: $data) { id } }`,
        { id, data: { ...(title ? { title } : {}), ...(altText ? { altText } : {}) } }
      );
    }

    // Hygraph ingests asynchronously; poll until `size` populates (bounded).
    let asset = await getAssetById(id);
    for (let attempt = 0; attempt < 12 && asset && asset.size == null; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      asset = await getAssetById(id);
    }
    if (!asset) {
      return { ok: false, error: "Upload succeeded but the asset could not be loaded." };
    }

    // Publish immediately so a freshly uploaded image is publicly servable. A
    // non-technical editor shouldn't have to know about the draft/published
    // split — a draft image dropped on a page wouldn't display for visitors.
    // The manual unpublish control in the gallery stays available afterwards.
    await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    asset = { ...asset, status: "published" };

    return { ok: true, asset };
  } catch (e) {
    return toActionError(e, "uploadAsset", "Couldn’t upload that file.");
  }
}

// Scan every block-layout surface for references to the given asset URL(s) and
// return the human-readable names of the pages/projects that use them. Used by
// the Media Library to warn an editor before a delete silently breaks a live
// page. Reads at the DRAFT stage (via the mutation token) so in-progress edits
// are caught too. Block layouts store plain image URL strings, so an exact
// string-match deep-walk over the parsed JSON is precise (no substring hazard).
export async function findAssetUsage(urls: string[]): Promise<Ok<{ used: string[] }> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;

  const targets = new Set(urls.filter((u) => typeof u === "string" && u));
  if (targets.size === 0) return { ok: true, used: [] };

  try {
    const [projectData, siteData] = await Promise.all([
      cmsQueryAuthed(
        `query ProjectUsage {
           projects(stage: DRAFT, first: 100) { title slug projectPage }
         }`
      ),
      cmsQueryAuthed(
        `query SiteDataUsage {
           siteDatas(stage: DRAFT) { atelier about contact home }
         }`
      ),
    ]);

    const used: string[] = [];

    const projects: { title?: string; slug?: string; projectPage?: unknown }[] = projectData?.projects ?? [];
    for (const p of projects) {
      if (jsonReferencesAny(p.projectPage, targets)) {
        used.push(p.title?.trim() || p.slug?.trim() || "Untitled project");
      }
    }

    const site = siteData?.siteDatas?.[0] ?? {};
    const SITE_FIELDS: { field: "atelier" | "about" | "contact" | "home"; label: string }[] = [
      { field: "atelier", label: "Atelier" },
      { field: "about", label: "About" },
      { field: "contact", label: "Contact" },
      { field: "home", label: "Home" },
    ];
    for (const { field, label } of SITE_FIELDS) {
      if (jsonReferencesAny(site[field], targets)) used.push(label);
    }

    return { ok: true, used };
  } catch (e) {
    return toActionError(e, "findAssetUsage", "Couldn’t check where that asset is used.");
  }
}

// Deep-walk arbitrary parsed JSON and report whether any string leaf exactly
// matches one of the target URLs.
function jsonReferencesAny(value: unknown, targets: Set<string>): boolean {
  if (typeof value === "string") return targets.has(value);
  if (Array.isArray(value)) return value.some((v) => jsonReferencesAny(v, targets));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => jsonReferencesAny(v, targets));
  }
  return false;
}
