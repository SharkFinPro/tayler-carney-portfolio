"use server";

import { headers } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { toActionError } from "@/lib/actionError";
import { clientKeyFromHeaders, createRateLimiter, formatRetryAfter } from "@/lib/rateLimit";
import { getPageGenerator, isPageGenerationConfigured } from "@/lib/ai";
import { toBlocks } from "@/lib/ai/toBlocks";
import { MAX_IMAGES, type SourceImage } from "@/lib/ai/types";
import type { Block } from "@/components/blocks/blocks";

// Drafting is the only action here that costs money per call, so it gets its
// own budget rather than sharing the login limiter. Generous enough that real
// iteration never hits it, tight enough that a stuck retry loop or a stolen
// session can't run up a bill.
const draftLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

/** Bounds on what one request may carry, checked before anything is billed. */
const MAX_ANSWER_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;

export type DraftInput = {
  title: string;
  answers: { question: string; answer: string }[];
  images: SourceImage[];
};

type DraftResult =
  | { ok: true; blocks: Block[]; generator: string }
  | { ok: false; error: string };

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
export async function draftProjectPage(input: DraftInput): Promise<DraftResult> {
  const denied = await requireAuth();
  if (denied) return denied;

  const generator = getPageGenerator();
  if (!generator) {
    return {
      ok: false,
      error: "AI drafting isn't configured. Set ANTHROPIC_API_KEY to enable it.",
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

  const images = (Array.isArray(input?.images) ? input.images : [])
    .filter((img) => typeof img?.url === "string" && img.url.startsWith("https://"))
    .slice(0, MAX_IMAGES)
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
    const page = await generator.generateProjectPage({ title, answers, images });

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

    console.info(`[ai] drafted ${blocks.length} blocks for "${title}" via ${generator.name}`);
    return { ok: true, blocks, generator: generator.name };
  } catch (e) {
    return toActionError(e, "draftProjectPage", "Couldn’t draft that page.");
  }
}
