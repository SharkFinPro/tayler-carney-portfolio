// Resolves the resume Asset reference stored in `global.resumeAssetId`.
//
// Thin wrapper over the generic asset resolver, kept as its own module so call
// sites read as intent ("resolve the resume") rather than as plumbing.

import { resolveAssetRef, type AssetRef } from "@/lib/assetRef";

export type ResumeAsset = AssetRef;

export function resolveResumeAsset(assetId: string): Promise<ResumeAsset | null> {
  return resolveAssetRef(assetId, "Resume");
}
