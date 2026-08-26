"use server";

import { PublishFailedError, toActionError } from "@/lib/actionError";
import { auditEvent } from "@/lib/observability";
import { requireAuth } from "@/lib/auth";
import { cmsMutate } from "@/lib/cms";
import { sanitizeBlocks, type Block } from "@/components/blocks/blocks";
import { sanitizeHome, type HomeContent } from "@/lib/home";
import { sanitizeGlobal, type GlobalContent } from "@/lib/global";
import { sanitizeSeo, type SeoContent } from "@/lib/seo";

// Whitelist of inline-editable scalar/list fields, keyed by Hygraph model.
// Model names are interpolated into the mutation string, so a value is only
// ever used after it passes this check. Relations are NOT inline-editable.
const EDITABLE_FIELDS: Record<string, string[]> = {
  Project: ["title", "description"],
};

type Result = { ok: true } | { ok: false; error: string };


async function updateAndPublish(model: string, id: string, data: Record<string, unknown>) {
  // Every content write funnels through here, so one audit call covers all of
  // them. Field names only — never values, which are the content itself and
  // would put whole page bodies into the log stream.
  const field = Object.keys(data).join(",");

  await cmsMutate(
    `mutation Update($id: ID!, $data: ${model}UpdateInput!) {
       update${model}(where: { id: $id }, data: $data) { id }
     }`,
    { id, data }
  );

  try {
    await cmsMutate(
      `mutation Publish($id: ID!) {
         publish${model}(where: { id: $id }, to: PUBLISHED) { id }
       }`,
      { id }
    );
  } catch (error) {
    auditEvent({ action: "updateAndPublish", model, entryId: id, field, outcome: "failed" });
    throw new PublishFailedError(error);
  }

  auditEvent({ action: "updateAndPublish", model, entryId: id, field, outcome: "ok" });
}

export async function updateContentField(
  model: string,
  id: string,
  field: string,
  value: string | string[]
): Promise<Result> {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!EDITABLE_FIELDS[model]?.includes(field)) {
    return { ok: false, error: `Field "${field}" is not editable.` };
  }

  try {
    await updateAndPublish(model, id, { [field]: value });
  } catch (e) {
    return toActionError(e, "updateContentField", "Couldn’t save that change.");
  }
  return { ok: true };
}

// Site-wide identity (display name, focus, email, social handles) lives in the
// SiteData singleton's `global` JSON field — surfaced across the site (nav,
// footer, contact). It is edited from the admin settings page and sanitized
// server-side with the same validator the renderer uses. Returns the sanitized
// value so the form can sync its state.
type GlobalResult = { ok: true; global: GlobalContent } | { ok: false; error: string };

export async function updateGlobal(id: string, rawGlobal: unknown): Promise<GlobalResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const global = sanitizeGlobal(rawGlobal);
  try {
    await updateAndPublish("SiteData", id, { global });
  } catch (e) {
    return toActionError(e, "updateGlobal", "Couldn’t save the site details.");
  }
  return { ok: true, global };
}

// Site SEO metadata lives in the SiteData singleton's `seo` JSON field and drives
// the root layout's generateMetadata(). Same sanitize-on-save contract as above.
type SeoResult = { ok: true; seo: SeoContent } | { ok: false; error: string };

export async function updateSeo(id: string, rawSeo: unknown): Promise<SeoResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const seo = sanitizeSeo(rawSeo);
  try {
    await updateAndPublish("SiteData", id, { seo });
  } catch (e) {
    return toActionError(e, "updateSeo", "Couldn’t save the SEO settings.");
  }
  return { ok: true, seo };
}

// Persist the homepage content singleton (SiteData.home). The whole object is
// sanitized server-side with the same validator the renderer uses, so the client
// can never store an invalid or unsafe layout. Returns the sanitized content so
// the editor can sync its optimistic state.
type HomeResult = { ok: true; home: HomeContent } | { ok: false; error: string };

export async function updateHome(id: string, rawHome: unknown): Promise<HomeResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const home = sanitizeHome(rawHome);
  try {
    await updateAndPublish("SiteData", id, { home });
  } catch (e) {
    return toActionError(e, "updateHome", "Couldn’t save the homepage.");
  }
  return { ok: true, home };
}

// Whitelist of JSON block-layout fields, keyed by model.
const BLOCK_LAYOUT_FIELDS: Record<string, string[]> = {
  Project: ["projectPage"],
  SiteData: ["atelier", "about", "contact"],
};

type BlockResult = { ok: true; blocks: Block[] } | { ok: false; error: string };

// Persist a block layout. The raw array is sanitized server-side (the same
// validator the renderer uses) before it is written, so the client can never
// store an invalid or unsafe layout. Returns the sanitized blocks so the editor
// can sync its optimistic state.
export async function updateBlockLayout(
  model: string,
  id: string,
  field: string,
  rawBlocks: unknown
): Promise<BlockResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!BLOCK_LAYOUT_FIELDS[model]?.includes(field)) {
    return { ok: false, error: `Field "${field}" is not editable.` };
  }

  const blocks = sanitizeBlocks(rawBlocks);
  try {
    await updateAndPublish(model, id, { [field]: blocks });
  } catch (e) {
    return toActionError(e, "updateBlockLayout", "Couldn’t save the page layout.");
  }
  return { ok: true, blocks };
}
