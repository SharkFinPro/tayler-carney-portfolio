"use server";

import { isAuthed } from "@/lib/auth";
import { cmsMutate } from "@/lib/cms";
import { getAssets, type MediaAsset } from "@/lib/getAssets";

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
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load assets." };
  }
}

export async function updateAsset(id: string, fields: { title?: string; altText?: string }): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(
      `mutation Update($id: ID!, $data: AssetUpdateInput!) {
         updateAsset(where: { id: $id }, data: $data) { id }
       }`,
      { id, data: { title: fields.title ?? null, altText: fields.altText ?? null } }
    );
    await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function publishAsset(id: string): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Publish failed." };
  }
}

export async function unpublishAsset(id: string): Promise<Ok<object> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    await cmsMutate(`mutation Unpub($id: ID!) { unpublishAsset(where: { id: $id }, from: PUBLISHED) { id } }`, { id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unpublish failed." };
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
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export interface UploadTarget {
  url: string;
  date: string;
  key: string;
  signature: string;
  algorithm: string;
  policy: string;
  credential: string;
  securityToken?: string;
}

// Step 1 of upload: create a draft asset and return the pre-signed S3 POST data.
// The browser then POSTs the file blob directly to S3 (see AssetPicker).
export async function createUploadTarget(
  fileName: string
): Promise<Ok<{ id: string; target: UploadTarget }> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const data = await cmsMutate(
      `mutation Create($fileName: String!) {
         createAsset(data: { fileName: $fileName }) {
           id
           upload {
             requestPostData { url date key signature algorithm policy credential securityToken }
           }
         }
       }`,
      { fileName }
    );
    const created = data?.createAsset;
    const target: UploadTarget | undefined = created?.upload?.requestPostData;
    if (!created?.id || !target) {
      return { ok: false, error: "Upload could not be initiated." };
    }
    return { ok: true, id: created.id, target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload init failed." };
  }
}

// Step 3 of upload: set metadata and publish once the file has been ingested.
export async function finalizeAsset(
  id: string,
  fields: { title?: string; altText?: string }
): Promise<Ok<{ url: string }> | Err> {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    // Poll until Hygraph has ingested the upload and a URL is available.
    let url = "";
    for (let attempt = 0; attempt < 10 && !url; attempt++) {
      const data = await cmsMutate(`query Asset($id: ID!) { asset(stage: DRAFT, where: { id: $id }) { url } }`, { id });
      url = data?.asset?.url ?? "";
      if (!url) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!url) return { ok: false, error: "Asset ingestion timed out." };

    if (fields.title || fields.altText) {
      await cmsMutate(
        `mutation Update($id: ID!, $data: AssetUpdateInput!) { updateAsset(where: { id: $id }, data: $data) { id } }`,
        { id, data: { title: fields.title ?? null, altText: fields.altText ?? null } }
      );
    }
    await cmsMutate(`mutation Pub($id: ID!) { publishAsset(where: { id: $id }, to: PUBLISHED) { id } }`, { id });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Finalize failed." };
  }
}
