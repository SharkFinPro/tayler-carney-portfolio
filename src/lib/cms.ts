// Hygraph request layer.
//
// Public reads use the content endpoint with the existing read token
// (`CMS_TOKEN`). Draft reads and mutations attach the server-only mutation
// token (`HYGRAPH_MUTATION_TOKEN`) and may target a dedicated mutation host
// (`CMS_MUTATION_ENDPOINT`), falling back to `CMS_ENDPOINT`.
//
// The mutation path must never be imported into a client component.

type Vars = Record<string, unknown>;

/**
 * How a read should be cached.
 *
 * Omitted entirely means `no-store` — the previous behavior, and still the
 * right default for anything on the write path or read at the DRAFT stage.
 */
export type CacheOptions = {
  /** Cache tags, so a future `revalidateTag` can target this read. */
  tags?: string[];
  /** Seconds before the entry is considered stale. */
  revalidate?: number;
};

async function cmsRequest(
  query: string,
  variables: Vars,
  token: string | undefined,
  useMutationEndpoint: boolean,
  cacheOptions?: CacheOptions
) {
  const endpoint =
    (useMutationEndpoint && process.env.CMS_MUTATION_ENDPOINT) || (process.env.CMS_ENDPOINT as string);

  // A cached read still POSTs, so Next keys the entry on the body — which
  // includes the query and its variables. That is what makes per-slug caching
  // work without any manual key construction.
  const caching: RequestInit & { next?: { tags?: string[]; revalidate?: number } } = cacheOptions
    ? { next: { tags: cacheOptions.tags, revalidate: cacheOptions.revalidate } }
    : { cache: "no-store" };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    ...caching,
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data;
}

// Public read — preserves the existing behavior of sending CMS_TOKEN.
// Pass `cacheOptions` to opt a specific read into the fetch cache; without it
// the read stays uncached, exactly as before.
export const cmsQuery = (query: string, variables: Vars = {}, cacheOptions?: CacheOptions) =>
  cmsRequest(query, variables, process.env.CMS_TOKEN, false, cacheOptions);

// Draft read — uses the mutation token so unpublished content is visible.
export const cmsQueryAuthed = (query: string, variables: Vars = {}) =>
  cmsRequest(query, variables, process.env.HYGRAPH_MUTATION_TOKEN, true);

// Write — uses the mutation token (and mutation endpoint if configured).
export const cmsMutate = (query: string, variables: Vars = {}) =>
  cmsRequest(query, variables, process.env.HYGRAPH_MUTATION_TOKEN, true);

// Hygraph's direct-upload flow: `createAsset` returns a pre-signed S3 POST
// payload, then the binary is POSTed straight to storage. The asset lands in
// the DRAFT stage. Run entirely server-side (the file arrives via a Server
// Action), so no pre-signed data is ever exposed to the client.
const CREATE_ASSET_MUTATION = `
  mutation CreateAsset($fileName: String!) {
    createAsset(data: { fileName: $fileName }) {
      id
      upload {
        requestPostData { url date key signature algorithm policy credential securityToken }
      }
    }
  }
`;

export async function cmsUpload(file: File): Promise<{ id: string }> {
  const data = await cmsMutate(CREATE_ASSET_MUTATION, { fileName: file.name });
  const asset = data?.createAsset;
  const post = asset?.upload?.requestPostData;
  if (!asset?.id || !post?.url) {
    throw new Error("Couldn't initialize the asset upload.");
  }

  // Field order matters to S3: all signed policy fields first, the file last.
  const form = new FormData();
  form.append("X-Amz-Date", post.date);
  form.append("key", post.key);
  form.append("X-Amz-Signature", post.signature);
  form.append("X-Amz-Algorithm", post.algorithm);
  form.append("policy", post.policy);
  form.append("X-Amz-Credential", post.credential);
  if (post.securityToken) form.append("X-Amz-Security-Token", post.securityToken);
  // Do NOT append Content-Type — the signed policy rejects extra fields.
  form.append("file", file);

  const response = await fetch(post.url, { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Asset upload failed (HTTP ${response.status}).${detail ? ` ${detail.slice(0, 200)}` : ""}`);
  }

  return { id: asset.id };
}
