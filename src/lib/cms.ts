// Hygraph request layer.
//
// Public reads use the content endpoint with the existing read token
// (`CMS_TOKEN`). Draft reads and mutations attach the server-only mutation
// token (`HYGRAPH_MUTATION_TOKEN`) and may target a dedicated mutation host
// (`CMS_MUTATION_ENDPOINT`), falling back to `CMS_ENDPOINT`.
//
// The mutation path must never be imported into a client component.

type Vars = Record<string, unknown>;

async function cmsRequest(query: string, variables: Vars, token: string | undefined, useMutationEndpoint: boolean) {
  const endpoint =
    (useMutationEndpoint && process.env.CMS_MUTATION_ENDPOINT) || (process.env.CMS_ENDPOINT as string);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data;
}

// Public read — preserves the existing behavior of sending CMS_TOKEN.
export const cmsQuery = (query: string, variables: Vars = {}) =>
  cmsRequest(query, variables, process.env.CMS_TOKEN, false);

// Draft read — uses the mutation token so unpublished content is visible.
export const cmsQueryAuthed = (query: string, variables: Vars = {}) =>
  cmsRequest(query, variables, process.env.HYGRAPH_MUTATION_TOKEN, true);

// Write — uses the mutation token (and mutation endpoint if configured).
export const cmsMutate = (query: string, variables: Vars = {}) =>
  cmsRequest(query, variables, process.env.HYGRAPH_MUTATION_TOKEN, true);
