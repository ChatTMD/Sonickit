import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

export async function runChecks() {
  const source = await readFile(new URL("../releases.js", import.meta.url), "utf8");
  const { parseRelease, fetchLatest, LATEST_API } = runInNewContext(
    source.replace(/^export /gm, "") + "\n({ parseRelease, fetchLatest, LATEST_API })",
    { URL, AbortController, setTimeout, clearTimeout });
  const results = [];
  const check = (name, fn) => { fn(); results.push(name); };
  function release(version = "0.2") {
    return { tag_name: `v${version}`, draft: false, prerelease: false, assets: ["exe", "zip"].map(kind => ({
      name: `SonicKit-${version}.${kind}`, state: "uploaded", size: 256,
      browser_download_url: `https://github.com/ChatTMD/Sonickit/releases/download/v${version}/SonicKit-${version}.${kind}`
    })) };
  }
  check("installer and portable download the same actual latest version", () => {
    const result = parseRelease(release());
    assert.equal(result.version, "v0.2"); assert.ok(result.exe.endsWith("SonicKit-0.2.exe")); assert.ok(result.zip.endsWith("SonicKit-0.2.zip"));
  });
  check("two-to-four-part versions are supported", () => { assert.equal(parseRelease(release("1.2.3.4")).version, "v1.2.3.4"); });
  check("drafts, prereleases and malformed versions are rejected", () => {
    assert.equal(parseRelease({ ...release(), draft: true }), null);
    assert.equal(parseRelease({ ...release(), prerelease: true }), null);
    assert.equal(parseRelease(release("preview")), null);
    assert.equal(parseRelease(null), null);
  });
  check("missing formats stay independent and never fall back to an old version", () => {
    const data = release(); data.assets.shift();
    data.assets.push(release("0.1").assets[0]);
    const result = parseRelease(data); assert.equal(result.exe, null); assert.ok(result.zip);
  });
  check("GitHub source archives are never used as portable packages", () => {
    const data = release(); data.assets = [{ name: "Source code.zip", size: 1024, state: "uploaded", browser_download_url: "https://github.com/ChatTMD/Sonickit/archive/refs/tags/v0.2.zip" }];
    assert.equal(parseRelease(data).zip, null);
  });
  check("empty and unfinished uploads are excluded", () => {
    const data = release(); data.assets[0].size = 0; data.assets[1].state = "open";
    assert.equal(parseRelease(data).exe, null); assert.equal(parseRelease(data).zip, null);
  });
  check("asset URLs cannot escape the known HTTPS repository and exact filename", () => {
    for (const url of ["https://evil.test/SonicKit-0.2.exe", "http://github.com/ChatTMD/Sonickit/releases/download/v0.2/SonicKit-0.2.exe",
      "https://github.com/other/repo/releases/download/v0.2/SonicKit-0.2.exe", "https://github.com/ChatTMD/Sonickit/releases/download/v0.1/SonicKit-0.2.exe",
      "https://user:password@github.com/ChatTMD/Sonickit/releases/download/v0.2/SonicKit-0.2.exe", "not a url",
      "https://github.com:8443/ChatTMD/Sonickit/releases/download/v0.2/SonicKit-0.2.exe", "https://github.com/ChatTMD/Sonickit/releases/download/v0.2/SonicKit-0.2.exe?redirect=bad"]) {
      const data = release(); data.assets[0].browser_download_url = url; assert.equal(parseRelease(data).exe, null, url);
    }
  });
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => release(requests.length === 1 ? "0.2" : "0.3") };
  };
  assert.equal((await fetchLatest(fetcher)).version, "v0.2");
  assert.equal((await fetchLatest(fetcher)).version, "v0.3");
  assert.ok(requests.every(r => r.url === LATEST_API && r.options.cache === "no-store" && r.options.credentials === "omit" && !r.options.headers.Authorization));
  results.push("each check obtains a fresh latest release without credentials or stale version caching");
  for (const status of [404, 403, 429, 500]) await assert.rejects(fetchLatest(async () => ({ ok: false, status })));
  await assert.rejects(fetchLatest(async () => { throw new Error("offline"); }));
  await assert.rejects(fetchLatest(async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } })));
  results.push("missing releases, rate limits, network errors and malformed responses fail cleanly");
  return results;
}

if (typeof process !== "undefined" && process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const results = await runChecks();
  for (const name of results) console.log(`PASS ${name}`);
  console.log(`${results.length} download checks passed.`);
}
