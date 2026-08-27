import { notFound } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { getAllProjects, getProjectMeta, normalizeSlug } from "./projectAccess";

// This layout exists for one reason: to make an unreachable project return an
// actual 404 status.
//
// `loading.tsx` in this segment puts the page inside a Suspense boundary, and
// Next flushes the shell — with a 200 — as soon as that boundary is reached.
// A `notFound()` in the page then still renders the 404 UI, but the status
// line is long gone: the response says 200 while the body says 404. That is a
// soft 404, and search engines treat it as a real page, so a retired or
// renamed project stays indexed forever instead of dropping out.
//
// A layout renders *outside* that boundary, before anything is flushed, so the
// same `notFound()` here sets the status correctly. Verified against a
// production build in both directions: a probe route with a `loading.tsx`
// returns 200 from its page and 404 from its layout.
//
// The alternative was deleting `loading.tsx`, which also works and costs the
// page skeletons on both portfolio routes. This keeps them.
//
// Nothing here is an extra CMS round-trip. Both reads are `cache()`-wrapped
// and the page and `generateMetadata` ask the same questions, so within a
// request the first caller pays and the rest are cache hits.

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { slug } = await params;

  const [project, isAdmin, orderedProjects] = await Promise.all([
    getProjectMeta(slug),
    isAuthed(),
    getAllProjects(),
  ]);

  if (!project) {
    notFound();
  }

  // Archived projects are hidden from the public entirely — they are dropped
  // from the grid and from the sitemap, so reaching one directly must 404 too.
  // Admins keep access, which is how an archived piece is reviewed before it
  // goes back up.
  const reachable = orderedProjects.some((p) => p.slug === normalizeSlug(slug) && !p.archived);
  if (!isAdmin && !reachable) {
    notFound();
  }

  return <>{children}</>;
}
