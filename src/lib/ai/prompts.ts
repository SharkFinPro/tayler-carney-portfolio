// Prompts and the response schema, shared across providers.
//
// These live here rather than inside a provider file because the provider is
// meant to be the swappable part — and it has already been swapped once. When
// they sat inside the provider, replacing it meant either importing from a
// file named for the old vendor or copying the prompts into the new one and
// letting the two drift.

import { imageToken, type PageOutline } from "./types";

/**
 * System prompt for drafting a project page.
 */
export const PAGE_SYSTEM_PROMPT = `You draft case-study pages for a structural fashion design portfolio.

The site's voice is editorial and technical: precise, concrete, unhurried. It
documents garment engineering — pattern-making, material research, construction
— and treats each piece as a structural problem. Write like a design archive,
not like marketing copy.

USING THE IMAGES — the part that matters most:
- Every image in the brief must appear somewhere in the page. All of them. A
  page that uses eight of forty images is wrong, however good those eight are.
  Before you finish, check every reference token off the list.
- Refer to an image by its token exactly as written — img-1, img-2, img-3 —
  never by URL, never by file name, never by a token that is not on the list.
- Use each image once. Group them: a 'gallery' section holds as many as the set
  needs, and a run of similar images (flats, fittings, process shots) belongs in
  one gallery rather than in a section each.
- Order matters. The tokens are listed in the order the designer chose them, so
  keep runs of them together unless the images plainly say otherwise.
- 'captioned' is for images that each earn a sentence — a construction detail, a
  finished look. Do not caption forty images individually.

STRUCTURE:
- Follow the example page outlines in the brief. They are this site's existing
  case studies, and they are the house style: match their section rhythm, their
  proportion of prose to images, and the register of their headings. Headings
  here are short noun phrases naming what the section holds — not sentences,
  not questions.
- Open with one 'intro' section. Then as many sections as the material and the
  images actually need: forty images is a longer page than four, not the same
  page with fuller galleries.
- Do not pad the page to fill the schema, and do not invent a section with
  nothing to say just to have somewhere to put images.

WRITING:
- Write only from what the designer told you and what you can see in the images.
  Never invent techniques, materials, measurements, dates, collaborators, or
  awards. If you don't know something, leave it out.
- Prefer specific observation over adjectives. "A bias-cut wool panel seamed off
  the shoulder" beats "a beautiful flowing design".
- No first-person plural, no exclamation marks, no phrases like "stunning",
  "showcase", "elevate", "journey", or "dive into".
- 'specs' rows should hold real, factual attributes (Material, Construction,
  Year) — only ones the designer stated or that are plainly visible.
- 'timeline' is for process stages, and only when the designer described a
  process. Otherwise omit it.`;

/**
 * JSON Schema for a drafted page.
 *
 * Structured outputs constrain the model to this shape, so the Server Action
 * never has to parse loose prose or repair broken JSON. `additionalProperties:
 * false` throughout keeps the output to exactly the vocabulary `toBlocks`
 * understands.
 */
export const PAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      minItems: 2,
      // No maxItems, deliberately. Gemini rejects the whole request with a
      // bare 400 INVALID_ARGUMENT once `maxItems` times the per-item schema
      // size crosses some internal ceiling: measured here, 10 was accepted and
      // 16 was not — and 10 had been fine until these items grew a couple of
      // `description` fields. A number that quietly depends on the size of the
      // schema around it is a trap for whoever adds the next field, and the
      // page length that matters is the one the prompt asks for anyway.
      // `maxOutputTokens` is the real bound on runaway output.
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "heading"],
        properties: {
          kind: {
            type: "string",
            enum: ["intro", "prose", "gallery", "captioned", "specs", "timeline"],
          },
          heading: { type: "string" },
          eyebrow: { type: "string" },
          body: { type: "string" },
          layout: { type: "string", enum: ["grid", "feature"] },
          imageRefs: {
            type: "array",
            description: 'Image reference tokens from the brief, e.g. "img-3". Never URLs.',
            items: { type: "string" },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["imageRef", "title", "description"],
              properties: {
                imageRef: {
                  type: "string",
                  description: 'One image reference token from the brief, e.g. "img-3".',
                },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value"],
              properties: { label: { type: "string" }, value: { type: "string" } },
            },
          },
          stages: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["marker", "title", "description"],
              properties: {
                marker: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * One example page, as structure with the prose stripped out.
 *
 * A compact list rather than JSON: the model is being shown a rhythm to match,
 * and a list of "kind — heading (n images)" reads as one, where a nested object
 * reads as a schema to fill in.
 */
function outlineLines(outline: PageOutline): string {
  const sections = outline.sections.map((s) => {
    const images = s.imageCount > 0 ? ` (${s.imageCount} image${s.imageCount === 1 ? "" : "s"})` : "";
    return `  - ${s.kind}: "${s.heading}"${images}`;
  });
  return [`"${outline.title}"`, ...sections].join("\n");
}

/**
 * The brief that accompanies the images.
 *
 * The token list is load-bearing rather than decorative: the model is told to
 * place every one of them, and `toBlocks` resolves each reference against the
 * set the admin actually supplied, appending whatever was left out rather than
 * losing it. The prompt asks; the mapping layer is what makes it true.
 */
export function pageBrief(input: {
  title: string;
  answers: { question: string; answer: string }[];
  images: { url: string; name: string }[];
  examples?: PageOutline[];
}): string {
  const answered = input.answers.filter((a) => a.answer.trim());
  const examples = input.examples ?? [];
  const count = input.images.length;

  return [
    `Project title: ${input.title}`,
    "",
    answered.length
      ? answered.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join("\n\n")
      : "(The designer did not answer the questions — work from the images alone.)",
    "",
    examples.length
      ? [
          "Existing case-study pages on this site, as structure only. Draft in",
          "keeping with these — section rhythm, image grouping, heading register:",
          "",
          examples.map(outlineLines).join("\n\n"),
          "",
        ].join("\n")
      : "",
    `The ${count} image${count === 1 ? "" : "s"} for this page, in the order the designer chose them.`,
    "Refer to each one by its token. Every one of them must appear in the page:",
    ...input.images.map((img, i) => `${imageToken(i)} — ${img.name}`),
  ]
    .filter((part) => part !== "")
    .join("\n");
}


// ── Alt text ────────────────────────────────────────────────────────────────

export const ALT_TEXT_SYSTEM_PROMPT = `You write alt text for images in a structural fashion design portfolio.

Alt text is a label read aloud in place of the image. Write the one sentence a
sighted reader would get from a glance — not a caption, not a critique, not a
list of everything present.

Rules:
- Start with the subject. Never begin with "Image of", "A photo of", "This image
  shows" or similar: a screen reader has already said it is an image.
- Aim for under 125 characters. One sentence.
- Describe what is visible. Never guess at materials, techniques, sizes, brands,
  places, or the identity of anyone shown.
- If people appear, describe them by what is visible and relevant to the garment
  (pose, how the piece is worn), not by inferred age, ethnicity, or gender.
- Be concrete: "a boxy blazer with exposed shoulder seams on a dress form" beats
  "a beautiful tailored garment".
- If the image is a flat, a technical drawing, or a document, say so — that is
  the most useful thing about it.
- Reply with the alt text and nothing else. No quotes, no preamble, no label.`;

/**
 * The user turn that accompanies the image.
 *
 * The file name is context, not content: it is often the camera's "IMG_4821",
 * and when it is meaningful the model should still be describing the image
 * rather than restating the name.
 */
export function altTextUserPrompt(name?: string): string {
  const trimmed = name?.trim();
  return trimmed
    ? `Write the alt text for this image. Its file is named "${trimmed}", which may or may not be meaningful — describe what you can see, not the name.`
    : "Write the alt text for this image.";
}

/** One sentence needs very little room; this also caps the per-call cost. */
export const ALT_TEXT_MAX_TOKENS = 300;
