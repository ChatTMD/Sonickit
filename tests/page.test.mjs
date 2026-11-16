import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Minimal DOM doubles exercise actual page handlers; this is not browser rendering verification.
export async function runChecks() {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const releases = "https://github.com/ChatTMD/Sonickit/releases";
  const elements = new Map();
  function element(id) {
    return { id, dataset: {}, attributes: {}, events: {}, textContent: "", hidden: true,
      href: releases, src: "images/01-audio.png", alt: "audio", tabIndex: -1,
      addEventListener(name, handler) { this.events[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      querySelector() { return this.version; }, focus() {}, showModal() {}, close() {} };
  }
  const tabs = ["audio", "generation", "subtitles", "drafts"].map(key => {
    const tab = element(`tab-${key}`); tab.dataset.screen = key; return tab;
  });
  const buttons = ["exe", "zip", "exe", "zip"].map(kind => {
    const button = element(kind); button.dataset.download = kind; button.version = element("version"); return button;
  });
  const destinations = [];
  let calls = 0;
  let response = () => Promise.reject(new Error("no upload"));
  let finishDecode;
  const document = {
    querySelectorAll(selector) { return selector === "[data-screen]" ? tabs : buttons; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }
  };
  runInNewContext(source.replace(/^import[^\n]+\n/, ""), {
    document, window: { location: { assign(url) { destinations.push(url); } } },
    fetchLatest: () => { calls++; return response(); }, RELEASES_URL: releases,
    Image: class { decode() { return new Promise(resolve => { finishDecode = resolve; }); } }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(document.getElementById("download-notice").hidden);
  assert.ok(buttons.every(button => button.version.textContent === "" && button.href === releases));
  const results = ["initial missing release leaves buttons visible without publication messages or invented versions"];
  const release = version => ({ version: `v${version}`, exe: `${releases}/download/v${version}/SonicKit-${version}.exe`, zip: `${releases}/download/v${version}/SonicKit-${version}.zip` });
  const click = button => button.events.click({ button: 0, preventDefault() {} });
  response = () => Promise.resolve(release("0.2"));
  await click(buttons[0]);
  assert.ok(buttons.every(button => button.version.textContent === "v0.2"));
  assert.equal(destinations.at(-1), release("0.2").exe);
  response = () => Promise.resolve(release("0.3"));
  await click(buttons[1]);
  assert.ok(buttons.every(button => button.version.textContent === "v0.3"));
  assert.equal(destinations.at(-1), release("0.3").zip);
  assert.equal(calls, 3);
  results.push("all four buttons show the fetched version and installer/portable clicks download the newest matching format");
  let finishRequest;
  response = () => new Promise(resolve => { finishRequest = resolve; });
  const first = click(buttons[0]);
  await click(buttons[1]);
  assert.equal(calls, 4);
  finishRequest(release("0.4")); await first;
  assert.equal(destinations.length, 3);
  results.push("repeated clicks while resolving latest produce only one download");
  response = () => Promise.resolve({ ...release("0.5"), zip: null });
  await click(buttons[1]);
  assert.equal(buttons[1].version.textContent, "");
  assert.equal(buttons[1].href, releases);
  assert.equal(destinations.length, 3);
  assert.equal(document.getElementById("download-notice").hidden, false);
  results.push("a missing ZIP never downloads an EXE or old ZIP and instead exposes the release-page fallback");
  const pendingScreen = tabs[1].events.click();
  await tabs[0].events.click();
  finishDecode(); await pendingScreen;
  assert.equal(document.getElementById("screen-image").src, "images/01-audio.png");
  results.push("rapid screenshot selection cannot let a delayed image overwrite the latest choice");
  return results;
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("page.test.mjs")) {
  for (const name of await runChecks()) console.log(`PASS ${name}`);
}
