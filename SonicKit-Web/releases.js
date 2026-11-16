export const REPOSITORY = "https://github.com/ChatTMD/Sonickit";
export const RELEASES_URL = `${REPOSITORY}/releases`;
export const LATEST_API = "https://api.github.com/repos/ChatTMD/Sonickit/releases/latest";

/** Only uploaded application packages from this repository qualify, never source archives. */
export function parseRelease(data) {
  if (!data || data.draft || data.prerelease || !Array.isArray(data.assets)) return null;
  const version = String(data.tag_name || "").replace(/^[vV]/, "");
  if (!/^\d+\.\d+(?:\.\d+){0,2}$/.test(version)) return null;
  const result = { version: `v${version}`, exe: null, zip: null };
  for (const kind of ["exe", "zip"]) {
    const name = `SonicKit-${version}.${kind}`;
    const asset = data.assets.find(item => item.name === name && item.state === "uploaded" && item.size > 0);
    if (!asset) continue;
    try {
      const url = new URL(asset.browser_download_url);
      const expectedPath = `/ChatTMD/Sonickit/releases/download/${encodeURIComponent(data.tag_name)}/${name}`;
      if (url.protocol === "https:" && url.hostname === "github.com" && !url.port &&
          !url.username && !url.password && !url.search && !url.hash && url.pathname === expectedPath) {
        result[kind] = url.href;
      }
    } catch { /* A malformed asset never becomes a download link. */ }
  }
  return result;
}

export async function fetchLatest(fetcher = globalThis.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) throw new Error("release-unavailable");
    const release = parseRelease(await response.json());
    if (!release) throw new Error("invalid-release");
    return release;
  } finally { clearTimeout(timeout); }
}
