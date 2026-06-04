/**
 * Custom next/image loader. The Bun API at /img/:gid/:pid/:size already
 * serves short-lived presigned redirects to S3-derived WebP - we don't want
 * Next's optimizer to fetch + re-encode those (it would burn CPU,
 * double-store, and fight the presign TTL).
 *
 * So this loader returns `src` verbatim. `next/image` still gives us lazy
 * loading, intrinsic sizing, and blurDataURL placeholders - just no
 * server-side optimization step.
 */
export default function lumiereImageLoader({ src }: { src: string }): string {
  return src;
}
