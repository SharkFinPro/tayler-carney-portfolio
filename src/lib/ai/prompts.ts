// Prompts shared between providers.
//
// The alt-text instructions live here rather than inside one provider file
// because two providers now write alt text for the same library. If each held
// its own copy they would drift, and the drift would be visible in the
// content: which service happened to be configured would decide how an image
// is described to a screen-reader user. Same prompt, either way.

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
