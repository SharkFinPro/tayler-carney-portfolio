"use server";

import { PublishFailedError, toActionError } from "@/lib/actionError";
import { auditEvent } from "@/lib/observability";
import { requireAuth } from "@/lib/auth";
import { cmsMutate, cmsQueryAuthed } from "@/lib/cms";
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


/**
 * Write to the DRAFT stage. Does not publish.
 *
 * Saving used to publish in the same breath, which meant there was nowhere to
 * work: adding a block, committing an edit, even a drag-reorder went straight
 * to the live site. Restructuring a page in front of visitors was the only
 * option available.
 *
 * Publishing is now `publishEntry`, called explicitly. Admins read the DRAFT
 * stage (see `cachedReads.cmsRead`), so the editor shows the work in progress
 * while visitors keep seeing the last published version.
 */
async function updateDraft(model: string, id: string, data: Record<string, unknown>) {
  // Every content write funnels through here, so one audit call covers all of
  // them. Field names only — never values, which are the content itself and
  // would put whole page bodies into the log stream.
  const field = Object.keys(data).join(",");

  try {
    await cmsMutate(
      `mutation Update($id: ID!, $data: ${model}UpdateInput!) {
         update${model}(where: { id: $id }, data: $data) { id }
       }`,
      { id, data }
    );
  } catch (error) {
    auditEvent({ action: "updateDraft", model, entryId: id, field, outcome: "failed" });
    throw error;
  }

  auditEvent({ action: "updateDraft", model, entryId: id, field, outcome: "ok" });
}

/** Promote an entry's draft to PUBLISHED, making it visible to visitors. */
async function publishEntry(model: string, id: string) {
  try {
    await cmsMutate(
      `mutation Publish($id: ID!) {
         publish${model}(where: { id: $id }, to: PUBLISHED) { id }
       }`,
      { id }
    );
  } catch (error) {
    auditEvent({ action: "publish", model, entryId: id, outcome: "failed" });
    throw new PublishFailedError(error);
  }

  auditEvent({ action: "publish", model, entryId: id, outcome: "ok" });
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
    await updateDraft(model, id, { [field]: value });
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
    await updateDraft("SiteData", id, { global });
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
    await updateDraft("SiteData", id, { seo });
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
    await updateDraft("SiteData", id, { home });
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
    await updateDraft(model, id, { [field]: blocks });
  } catch (e) {
    return toActionError(e, "updateBlockLayout", "Couldn’t save the page layout.");
  }
  return { ok: true, blocks };
}

// ── Publishing ───────────────────────────────────────────────────────────────
//
// Writes land in DRAFT; this is what makes them visible to visitors. Kept as a
// separate, explicit step so an admin can restructure a page without doing it
// in front of an audience.

/** Models an admin may publish. Same whitelist discipline as the write paths. */
const PUBLISHABLE_MODELS = ["Project", "SiteData"];

export type PublishState = {
  /** True when the draft has changes the published version does not. */
  pending: boolean;
  /** ISO timestamp of the last publish, or null if never published. */
  publishedAt: string | null;
};

/**
 * Whether an entry has unpublished changes.
 *
 * `documentInStages` reports each stage's `updatedAt`, so a draft newer than
 * the published copy means pending work. Treating "never published" as pending
 * is deliberate: an entry visitors cannot see yet is exactly the case the
 * publish button exists for.
 */
export async function getPublishState(
  model: string,
  id: string
): Promise<{ ok: true; state: PublishState } | { ok: false; error: string }> {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!PUBLISHABLE_MODELS.includes(model)) {
    return { ok: false, error: `"${model}" is not publishable.` };
  }

  try {
    const singular = model.charAt(0).toLowerCase() + model.slice(1);
    const data = await cmsQueryAuthed(
      `query PublishState($id: ID!) {
         entry: ${singular}(where: { id: $id }, stage: DRAFT) {
           updatedAt
           documentInStages(stages: [PUBLISHED], includeCurrent: false) { updatedAt }
         }
       }`,
      { id }
    );

    const entry = data?.entry as
      | { updatedAt?: string; documentInStages?: { updatedAt?: string }[] }
      | null;

    if (!entry) return { ok: false, error: "That entry no longer exists." };

    const publishedAt = entry.documentInStages?.[0]?.updatedAt ?? null;
    const draftAt = entry.updatedAt ?? null;

    return {
      ok: true,
      state: {
        // Never published, or the draft moved on since the last publish.
        pending: !publishedAt || (!!draftAt && draftAt > publishedAt),
        publishedAt,
      },
    };
  } catch (e) {
    return toActionError(e, "getPublishState", "Couldn’t check the publish state.");
  }
}

/** Publish an entry's draft, making the current content visible to visitors. */
export async function publishContent(
  model: string,
  id: string
): Promise<{ ok: true; state: PublishState } | { ok: false; error: string }> {
  const denied = await requireAuth();
  if (denied) return denied;

  if (!PUBLISHABLE_MODELS.includes(model)) {
    return { ok: false, error: `"${model}" is not publishable.` };
  }

  try {
    await publishEntry(model, id);
  } catch (e) {
    return toActionError(e, "publishContent", "Couldn’t publish that.");
  }

  // Report the state back rather than assuming it, so the UI reflects what the
  // CMS actually holds — including the real publish timestamp.
  return getPublishState(model, id);
}
