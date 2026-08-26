"use server";

import { toActionError } from "@/lib/actionError";
import { isAuthed } from "@/lib/auth";
import { cmsMutate, cmsQuery } from "@/lib/cms";
import { sanitizePortfolio, slugify, type PortfolioConfig } from "@/lib/portfolio";

type Result = { ok: true } | { ok: false; error: string };

async function requireAuth(): Promise<{ ok: false; error: string } | null> {
  return (await isAuthed()) ? null : { ok: false, error: "Not authorized." };
}

// Persist the portfolio ordering + archive config onto the SiteData singleton's
// `portfolio` JSON field. The whole object is sanitized server-side with the
// same validator the renderer uses, so the client can never store an invalid
// value. Returns the sanitized config so the editor can sync optimistic state.
type ConfigResult = { ok: true; config: PortfolioConfig } | { ok: false; error: string };

export async function updatePortfolio(siteId: string, rawConfig: unknown): Promise<ConfigResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const config = sanitizePortfolio(rawConfig);
  try {
    await cmsMutate(
      `mutation Update($id: ID!, $data: SiteDataUpdateInput!) {
         updateSiteData(where: { id: $id }, data: $data) { id }
       }`,
      { id: siteId, data: { portfolio: config } }
    );
    await cmsMutate(
      `mutation Publish($id: ID!) {
         publishSiteData(where: { id: $id }, to: PUBLISHED) { id }
       }`,
      { id: siteId }
    );
  } catch (e) {
    return toActionError(e, "updatePortfolio", "Couldn’t save the portfolio order.");
  }
  return { ok: true, config };
}

// Permanently delete a project. Used only from the archived drawer — a project
// must be archived before it can be deleted, so this is never a one-click
// destructive action on a live project. The published entry is unpublished
// first (deleting only removes the draft otherwise); a project that wasn't
// published is tolerated, so the unpublish error is swallowed.
export async function deleteProject(id: string): Promise<Result> {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!id) return { ok: false, error: "Missing project id." };

  try {
    try {
      await cmsMutate(
        `mutation Unpublish($id: ID!) {
           unpublishProject(where: { id: $id }, from: PUBLISHED) { id }
         }`,
        { id }
      );
    } catch {
      // Not published (or already unpublished) — fine, continue to delete.
    }
    await cmsMutate(
      `mutation Delete($id: ID!) {
         deleteProject(where: { id: $id }) { id }
       }`,
      { id }
    );
  } catch (e) {
    return toActionError(e, "deleteProject", "Couldn’t delete that project.");
  }
  return { ok: true };
}

type CreateInput = { title: string; slug: string; description: string };
type CreatedProject = { id: string; title: string; slug: string; description: string; archived: false };
type CreateResult = { ok: true; project: CreatedProject } | { ok: false; error: string };

// Create a new Project from the basic fields collected in the "new project"
// modal, then publish it so it shows up on the live portfolio. The block-based
// project page is left empty here — it's authored later on the project page
// itself. New projects auto-append to the portfolio order via the merge, so no
// config write is needed.
export async function createProject(input: CreateInput): Promise<CreateResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const title = input.title.trim();
  const description = input.description.trim();
  // Prefer an explicit slug; fall back to one derived from the title.
  const slug = slugify(input.slug.trim() || title);

  if (!title) return { ok: false, error: "A title is required." };
  if (!slug) return { ok: false, error: "A valid slug is required." };

  try {
    // Guard against duplicate slugs up front — the project page routes on slug,
    // so two projects sharing one would shadow each other.
    const existing = await cmsQuery(
      `query Existing($slug: String!) { projects(where: { slug: $slug }) { id } }`,
      { slug }
    );
    if (existing?.projects?.length) {
      return { ok: false, error: `A project with the slug "${slug}" already exists.` };
    }

    const data = await cmsMutate(
      `mutation Create($data: ProjectCreateInput!) {
         createProject(data: $data) { id slug }
       }`,
      { data: { title, slug, description } }
    );
    const created = data?.createProject;
    if (!created?.id) return { ok: false, error: "Create failed." };

    await cmsMutate(
      `mutation Publish($id: ID!) {
         publishProject(where: { id: $id }, to: PUBLISHED) { id }
       }`,
      { id: created.id }
    );
    // Return the full row so the client can append it optimistically — the
    // content (CDN) read endpoint lags a fresh publish, so a re-fetch right now
    // would usually miss it.
    return { ok: true, project: { id: created.id, title, slug: created.slug, description, archived: false } };
  } catch (e) {
    return toActionError(e, "createProject", "Couldn’t create the project.");
  }
}
