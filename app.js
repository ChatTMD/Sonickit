import { fetchLatest, RELEASES_URL } from "./releases.js";

const screens = {
  audio: { src: "images/01-audio.png?v=20261117", title: "音频剪辑", alt: "SonicKit 音频剪辑界面，包含文件列表、波形预览与气口剪辑参数", caption: "看见每一处停顿，保留表达的节奏。" },
  generation: { src: "images/04-generation.png?v=20261117", title: "AI 配音", alt: "SonicKit AI 配音界面，包含音色选择、朗读参数与音频库", caption: "选择合适的声音，让文字自然表达。" },
  subtitles: { src: "images/02-subtitles.png?v=20261117", title: "字幕识别", alt: "SonicKit 字幕识别界面，包含字幕编辑、波形定位与导出入口", caption: "从听见，到看见，字幕与素材相伴。" },
  drafts: { src: "images/10-draft-import.png?v=20261117", title: "草稿管理", alt: "SonicKit 草稿音频导入界面，包含音频库、导入参数与 CapCut 时间线", caption: "把配音与文字，放进故事的时间线。" }
};
const tabs = [...document.querySelectorAll("[data-screen]")];
const image = document.getElementById("screen-image");
const panel = document.getElementById("screen-panel");
const zoom = document.getElementById("screen-zoom");
let activeScreen = "audio";
let selection = 0;

async function selectScreen(tab) {
  const key = tab.dataset.screen;
  const ticket = ++selection;
  if (key === activeScreen) return;
  const screen = screens[key];
  const preload = new Image(); preload.src = screen.src;
  try { await preload.decode(); } catch { return; }
  if (ticket !== selection) return;
  activeScreen = key;
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1;
  }
  image.src = screen.src; image.alt = screen.alt;
  panel.setAttribute("aria-labelledby", tab.id);
  zoom.setAttribute("aria-label", `放大${screen.title}界面截图`);
  document.getElementById("screen-caption").textContent = screen.caption;
  document.getElementById("screen-index").textContent = `0${tabs.indexOf(tab) + 1} / 04`;
}
for (const tab of tabs) {
  tab.addEventListener("click", () => selectScreen(tab));
  tab.addEventListener("keydown", event => {
    let index = tabs.indexOf(tab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault(); tabs[index].focus(); selectScreen(tabs[index]);
  });
}
const lightbox = document.getElementById("lightbox");
zoom.addEventListener("click", () => {
  const largeImage = document.getElementById("lightbox-image");
  largeImage.src = image.src; largeImage.alt = image.alt;
  lightbox.showModal();
});
document.getElementById("lightbox-close").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", event => { if (event.target === lightbox) lightbox.close(); });
document.getElementById("year").textContent = new Date().getFullYear();

const buttons = [...document.querySelectorAll("[data-download]")];
let pendingRelease = null;
let downloading = false;
function applyRelease(release) {
  for (const button of buttons) {
    const kind = button.dataset.download;
    button.href = release[kind] || RELEASES_URL;
    const version = button.querySelector("[data-version]");
    version.textContent = release[kind] ? release.version : "";
  }
}
function latest() {
  if (!pendingRelease) pendingRelease = fetchLatest().then(release => {
    applyRelease(release); return release;
  }).finally(() => { pendingRelease = null; });
  return pendingRelease;
}
function notify(message) {
  document.getElementById("notice-message").textContent = message;
  document.getElementById("download-notice").hidden = false;
}
document.getElementById("notice-close").addEventListener("click", () => { document.getElementById("download-notice").hidden = true; });
for (const button of buttons) {
  button.addEventListener("click", async event => {
    // Preserve open-in-new-tab and normal link behavior for modified clicks.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (downloading) return;
    downloading = true; button.setAttribute("aria-busy", "true");
    document.getElementById("download-notice").hidden = true;
    try {
      const release = await latest();
      const destination = release[button.dataset.download];
      if (!destination) throw new Error("package-unavailable");
      window.location.assign(destination);
    } catch { notify("暂时无法获取下载文件，请前往 GitHub 发行页。"); }
    finally { downloading = false; button.removeAttribute("aria-busy"); }
  });
}
// Failure stays silent on initial display: the download buttons remain visible and usable.
latest().catch(() => {});
