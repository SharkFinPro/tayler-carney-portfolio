"use server";

import { isAuthed } from "@/lib/auth";
import { cmsMutate } from "@/lib/cms";
import { sanitizeBlocks, type Block } from "@/components/blocks/blocks";

// Whitelist of inline-editable scalar/list fields, keyed by Hygraph model.
// Model names are interpolated into the mutation string, so a value is only
// ever used after it passes this check. Relations are NOT inline-editable.
const EDITABLE_FIELDS: Record<string, string[]> = {
  Project: ["title", "description"],
  AboutPage: ["title", "subtitle"],
  SiteData: ["displayName", "focus", "email", "linkedInHandle", "instagramHandle"],
};

type Result = { ok: true } | { ok: false; error: string };

async function requireAuth(): Promise<{ ok: false; error: string } | null> {
  return (await isAuthed()) ? null : { ok: false, error: "Not authorized." };
}

async function updateAndPublish(model: string, id: string, data: Record<string, unknown>) {
  await cmsMutate(
    `mutation Update($id: ID!, $data: ${model}UpdateInput!) {
       update${model}(where: { id: $id }, data: $data) { id }
     }`,
    { id, data }
  );
  await cmsMutate(
    `mutation Publish($id: ID!) {
       publish${model}(where: { id: $id }, to: PUBLISHED) { id }
     }`,
    { id }
  );
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
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
  return { ok: true };
}

// Whitelist of JSON block-layout fields, keyed by model.
const BLOCK_LAYOUT_FIELDS: Record<string, string[]> = {
  Project: ["projectPage"],
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
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
  return { ok: true, blocks };
}
