/**
 * Normalises a stored image URL so it always resolves to the correct origin.
 *
 * R2 should always produce fully-qualified https:// URLs, but when
 * R2_PUBLIC_URL is empty during local dev the storage service returns a
 * root-relative path (e.g. "/menu/logos/abc.webp").  Blob URLs from
 * URL.createObjectURL are already absolute and must pass through unchanged.
 */
export function getDisplayUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("blob:")) return url;
  // Relative URL — prepend the backend origin derived from VITE_API_URL.
  const apiUrl =
    (import.meta as unknown as { env: Record<string, string> }).env
      .VITE_API_URL || "http://localhost:3000/api";
  const baseUrl = apiUrl.replace(/\/api$/, "");
  return `${baseUrl}/${url.replace(/^\//, "")}`;
}
