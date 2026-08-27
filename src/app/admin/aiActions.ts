"use server";

import { headers } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { toActionError } from "@/lib/actionError";
import { clientKeyFromHeaders, createRateLimiter, formatRetryAfter } from "@/lib/rateLimit";
import {
  getImageDescriber,
  getPageGenerator,
  isImageDescriptionConfigured,
  isPageGenerationConfigured,
} from "@/lib/ai";
import { toBlocks } from "@/lib/ai/toBlocks";
import { outlinePages } from "@/lib/ai/houseStyle";
import { cmsQueryAuthed } from "@/lib/cms";
import { cleanAltText, isDescribableImageUrl } from "@/lib/ai/altText";
import type { ImageSource, PageOutline, SourceImage } from "@/lib/ai/types";
import { auditEvent, reportError } from "@/lib/observability";
import type { Block } from "@/components/blocks/blocks";

// Drafting is the only action here that costs money per call, so it gets its
// own budget rather than sharing the login limiter. Generous enough that real
// iteration never hits it, tight enough that a stuck retry loop or a stolen
// session can't run up a bill.
const draftLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

// Alt text is a much smaller call, and describing a library that has gone
// undescribed is a legitimately bulk activity — so a separate, larger budget.
// Still bounded: this is the endpoint a stuck retry loop would hammer.
const describeLimiter = createRateLimiter({ limit: 120, windowMs: 60 * 60 * 1000 });

/** Bounds on what one request may carry, checked before anything is billed. */
const MAX_ANSWER_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;

export type DraftInput = {
  title: string;
  answers: { question: string; answer: string }[];
  images: SourceImage[];
};

type DraftResult =
  | { ok: true; blocks: Block[]; generator: string; unseenImages: number }
  | { ok: false; error: string };

/**
 * Read the existing case studies so a draft can be laid out like them.
 *
 * Read at DRAFT stage through the mutation token, matching the rest of the
 * admin surface: a page the designer is midway through restructuring is a
 * better example of where the site is going than its last published version.
 *
 * Never throws. Examples make a draft better, and a CMS hiccup should cost the
 * draft its house-style reference rather than cost the admin their draft.
 */
async function loadExamples(excludeTitle: string): Promise<PageOutline[]> {
  try {
    const data = await cmsQueryAuthed(
      `query DraftExamples {
         projects(stage: DRAFT, first: 100) { title projectPage }
       }`
    );
    const projects: { title?: string; projectPage?: unknown }[] = data?.projects ?? [];

    return outlinePages(
      projects.map((p) => ({ title: p.title ?? "", layout: p.projectPage })),
      excludeTitle
    );
  } catch (e) {
    reportError({ scope: "ai", context: "draftProjectPage.examples", error: e });
    return [];
  }
}

/** Whether the admin UI should offer AI drafting at all. */
export async function pageGenerationAvailable(): Promise<boolean> {
  const denied = await requireAuth();
  if (denied) return false;
  return isPageGenerationConfigured();
}

/**
 * Draft a set of content blocks for a project page.
 *
 * Deliberately does NOT save. The blocks come back for the admin to review,
 * edit, and explicitly accept — generated content should never appear on the
 * live site without someone having looked at it.
 */
/** Whether the admin UI should offer alt-text suggestions. */
export async function altTextSuggestionAvailable(): Promise<boolean> {
  const denied = await requireAuth();
  if (denied) return false;
  return isImageDescriptionConfigured();
}

/** Image formats the API accepts, and the only ones the uploader produces. */
const INLINE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Cap on an inline (not-yet-uploaded) image.
 *
 * Base64 inflates by a third, so this sits comfortably under both the API's
 * per-image limit and the 8 MB Server Action body limit. The uploader exports
 * at most 2400px, which is far below this in practice.
 */
const MAX_INLINE_IMAGE_BYTES = 3.5 * 1024 * 1024;

export type AltTextInput = {
  source: ImageSource;
  name?: string;
};

type AltTextResult = { ok: true; altText: string } | { ok: false; error: string };

/**
 * Suggest alt text for one image.
 *
 * Like drafting, this deliberately does NOT save. The suggestion lands in the
 * field for the admin to read, edit, and save — alt text that nobody checked is
 * how a library ends up full of confidently wrong descriptions, which is worse
 * for a screen-reader user than an empty attribute.
 */
export async function suggestAltText(input: AltTextInput): Promise<AltTextResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const describer = getImageDescriber();
  if (!describer) {
    return {
      ok: false,
      error: "AI suggestions aren't configured. Set GEMINI_API_KEY to enable them.",
    };
  }

  const client = clientKeyFromHeaders(await headers());
  const limit = describeLimiter.check(client);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `That's a lot of suggestions. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }

  const source = input?.source;
  if (source?.kind === "url") {
    if (!isDescribableImageUrl(source.url)) {
      return { ok: false, error: "That image isn't a Media Library asset." };
    }
  } else if (source?.kind === "inline") {
    if (!INLINE_MEDIA_TYPES.includes(source.mediaType)) {
      return { ok: false, error: "That image format isn't supported for suggestions." };
    }
    // base64 length maps back to byte count at 3/4, near enough for a bound.
    if ((source.base64?.length ?? 0) * 0.75 > MAX_INLINE_IMAGE_BYTES) {
      return { ok: false, error: "That image is too large to describe. Upload it first." };
    }
    if (!source.base64) {
      return { ok: false, error: "There's no image to describe yet." };
    }
  } else {
    return { ok: false, error: "There's no image to describe yet." };
  }

  try {
    const raw = await describer.describeImage({
      source,
      name: input.name?.trim().slice(0, 200),
    });

    // The trust boundary: model output never reaches the field unsanitized.
    const altText = cleanAltText(raw);
    if (!altText) {
      return { ok: false, error: "The suggestion came back empty. Try again, or write it yourself." };
    }

    auditEvent({
      action: "suggestAltText",
      model: "Asset",
      field: "altText",
      client,
      outcome: "ok",
      extra: { provider: describer.name, length: altText.length },
    });

    return { ok: true, altText };
  } catch (e) {
    return toActionError(e, "suggestAltText", "Couldn’t suggest alt text for that image.");
  }
}

export async function draftProjectPage(input: DraftInput): Promise<DraftResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const generator = getPageGenerator();
  if (!generator) {
    return {
      ok: false,
      error: "AI drafting isn't configured. Set GEMINI_API_KEY to enable it.",
    };
  }

  const client = clientKeyFromHeaders(await headers());
  const limit = draftLimiter.check(client);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `That's a lot of drafts. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }

  // Normalize and bound the input before spending a request on it.
  const title = String(input?.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) {
    return { ok: false, error: "Give the project a title first — it's the subject of the page." };
  }

  // No count limit: the ceiling is how much fits in one provider request, which
  // the generator works out from the images themselves and reports back as
  // `skipped`. A number here would be a guess about file sizes it cannot see.
  const images = (Array.isArray(input?.images) ? input.images : [])
    // Same allowlist the alt-text path uses. These URLs are fetched by this
    // process, and "starts with https://" is not a host check —
    // https://evil.test/x.jpg passed it.
    .filter((img) => isDescribableImageUrl(img?.url))
    .map((img) => ({
      url: img.url,
      name: String(img.name ?? "").trim().slice(0, 200),
      altText: img.altText ? String(img.altText).trim().slice(0, 400) : undefined,
    }));

  const answers = (Array.isArray(input?.answers) ? input.answers : [])
    .map((a) => ({
      question: String(a?.question ?? "").trim(),
      answer: String(a?.answer ?? "").trim().slice(0, MAX_ANSWER_LENGTH),
    }))
    .filter((a) => a.question);

  if (!images.length && !answers.some((a) => a.answer)) {
    return {
      ok: false,
      error: "Add at least one image or answer a question — there's nothing to work from yet.",
    };
  }

  try {
    // Sequential rather than alongside the images: the examples are the cheap
    // half, and a draft should not start generating before they land.
    const examples = await loadExamples(title);
    const { page, unseen, model } = await generator.generateProjectPage({
      title,
      answers,
      images,
      examples,
    });

    // The trust boundary. Model output is mapped onto a fixed vocabulary, every
    // image URL is checked against the ones actually supplied, and the result
    // goes through the same sanitizer the CMS uses.
    const blocks = toBlocks(page, images);

    if (!blocks.length) {
      return {
        ok: false,
        error: "The draft came back empty. Try adding more detail to your answers.",
      };
    }

    // The model that answered, not the one configured — the provider works
    // down a chain when the preferred model is out of quota, and which one
    // served is the fact worth having in the log.
    console.info(
      `[ai] drafted ${blocks.length} blocks for "${title}" via ${model}` +
        ` (${images.length} images, ${unseen.length} unseen, ${examples.length} examples)`
    );
    return { ok: true, blocks, generator: generator.name, unseenImages: unseen.length };
  } catch (e) {
    return toActionError(e, "draftProjectPage", "Couldn’t draft that page.");
  }
}
