export function getImageUrl(url: string): string {
  if (url.startsWith("http")) return url;
  const apiUrl =
    (import.meta as any).env.VITE_API_URL || "http://localhost:3000/api";
  const baseUrl = apiUrl.replace("/api", "");
  return `${baseUrl}/${url}`;
}
