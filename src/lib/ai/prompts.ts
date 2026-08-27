// Prompts and the response schema, shared across providers.
//
// These live here rather than inside a provider file because the provider is
// meant to be the swappable part — and it has already been swapped once. When
// they sat inside the provider, replacing it meant either importing from a
// file named for the old vendor or copying the prompts into the new one and
// letting the two drift.

/**
 * System prompt for drafting a project page.
 */
export const PAGE_SYSTEM_PROMPT = `You draft case-study pages for a structural fashion design portfolio.

The site's voice is editorial and technical: precise, concrete, unhurried. It
documents garment engineering — pattern-making, material research, construction
— and treats each piece as a structural problem. Write like a design archive,
not like marketing copy.

Rules:
- Write only from what the designer told you and what you can see in the images.
  Never invent techniques, materials, measurements, dates, collaborators, or
  awards. If you don't know something, leave it out.
- Use ONLY the image URLs supplied in the user message, exactly as given. Never
  construct, guess, or modify a URL.
- Prefer specific observation over adjectives. "A bias-cut wool panel seamed off
  the shoulder" beats "a beautiful flowing design".
- No first-person plural, no exclamation marks, no phrases like "stunning",
  "showcase", "elevate", "journey", or "dive into".
- Open with one 'intro' section. Follow it with 2 to 6 more that suit the
  material you actually have. Do not pad the page to fill the schema.
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
      maxItems: 10,
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
          imageUrls: { type: "array", items: { type: "string" } },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["imageUrl", "title", "description"],
              properties: {
                imageUrl: { type: "string" },
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
 * The brief that accompanies the images.
 *
 * The URL list is load-bearing rather than decorative: the model is told to use
 * only these URLs, and `toBlocks` then enforces it by allowlisting every URL in
 * the output against the set the admin actually supplied. The prompt asks; the
 * mapping layer is what makes it true.
 */
export function pageBrief(input: {
  title: string;
  answers: { question: string; answer: string }[];
  images: { url: string; name: string }[];
}): string {
  const answered = input.answers.filter((a) => a.answer.trim());

  return [
    `Project title: ${input.title}`,
    "",
    answered.length
      ? answered.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join("\n\n")
      : "(The designer did not answer the questions — work from the images alone.)",
    "",
    "Images available for this page, with the exact URLs you must use:",
    ...input.images.map((img, i) => `${i + 1}. ${img.name} — ${img.url}`),
  ].join("\n");
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
