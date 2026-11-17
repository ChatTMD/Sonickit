"""Static and loopback checks; no desktop build, external request or browser required."""
from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import re
import subprocess
import struct
import sys
import threading
import unittest
import wave
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.references, self.downloads, self.tabs = [], [], [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        for key in ("src", "href"):
            if a.get(key):
                self.references.append(a[key])
        if "data-download" in a:
            self.downloads.append(a)
        if a.get("role") == "tab":
            self.tabs.append(a)


class WebsiteChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("website_preview", ROOT / "tools/preview.py")
        cls.preview = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.preview)
        cls.server = cls.preview.Server(("127.0.0.1", 0), cls.preview.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def test_page_and_shared_assets(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        page = Page()
        page.feed(source)
        self.assertEqual(len(page.ids), len(set(page.ids)))
        self.assertEqual(len(page.downloads), 4)
        self.assertEqual([item["data-download"] for item in page.downloads], ["exe", "zip", "exe", "zip"])
        self.assertEqual(sum(t["aria-selected"] == "true" for t in page.tabs), 1)
        self.assertEqual(len(page.tabs), 4)
        self.assertNotIn("暂未发布", source)
        self.assertFalse(any("disabled" in item for item in page.downloads))
        for ref in page.references:
            if ":" in ref or ref.startswith("//"):
                continue
            if ref.startswith("#"):
                self.assertIn(ref[1:], page.ids)
            else:
                self.assertTrue((ROOT / urlsplit(ref).path).is_file(), ref)
        readme = (ROOT / "README.md").read_text(encoding="utf-8-sig")
        for image in re.findall(r'(?:!\[[^\]]*\]\(|src=")(images/[^)"\s]+)', readme):
            self.assertTrue((ROOT / image).is_file(), image)
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        for image in re.findall(r'src: "(images/[^"]+)"', app):
            image = urlsplit(image).path
            self.assertTrue((ROOT / image).is_file())
            self.assertIn(image, readme)
        self.assertIn("https://www.sonickit.top/", source)
        self.assertNotIn("api.sonickit.top", app)

    def test_preview_serves_site_and_module_mime(self):
        for resource, content_type in [("/", "text/html"), ("/app.js", "text/javascript"),
                                       ("/releases.js", "text/javascript"), ("/styles.css", "text/css"),
                                       ("/images/01-audio.png", "image/png")]:
            with self.subTest(resource=resource), urllib.request.urlopen(self.base + resource) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get_content_type(), content_type)
                self.assertTrue(response.read())

    def test_preview_does_not_expose_tools_or_outside_files(self):
        for resource in ["/tools/preview.py", "/tests/check_site.py", "/.gitignore",
                         "/.vscode/tasks.json", "/images/", "/../AGENTS.md", "/%2e%2e/AGENTS.md"]:
            with self.subTest(resource=resource), self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.base + resource)
            self.assertEqual(error.exception.code, 404)

    def test_repeated_preview_reuses_existing_server(self):
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run([sys.executable, "-B", str(ROOT / "tools/preview.py"),
                                 "--port", str(self.server.server_port), "--no-open"],
                                capture_output=True, text=True, timeout=5, creationflags=flags)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Reusing SonicKit website preview", result.stdout)
        with urllib.request.urlopen(self.base + self.preview.IDENTITY_PATH) as response:
            self.assertEqual(json.load(response)["root"], self.preview.ROOT_ID)

    def test_preview_task_has_no_desktop_build(self):
        task = json.loads((ROOT / ".vscode/tasks.json").read_text(encoding="utf-8"))["tasks"][0]
        self.assertEqual(task["label"], "SonicKit Web: 预览官网")
        self.assertEqual(task["command"], "py")
        self.assertEqual(task["runOptions"]["instanceLimit"], 1)
        self.assertNotIn("dependsOn", task)
        self.assertNotIn("build", json.dumps(task))

    def test_voice_samples_are_complete_and_unchanged(self):
        samples = json.loads((ROOT / "audio/samples.json").read_text(encoding="utf-8"))
        self.assertEqual(len(samples), 10)
        self.assertEqual(len({sample["id"] for sample in samples}), 10)
        self.assertEqual({sample["model"] for sample in samples},
                         {"Kokoro", "OmniVoice Q8", "MOSS-TTS-Nano", "Supertonic3"})
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertEqual(source.count('class="voice-audio"'), 10)
        self.assertEqual(source.count('controls preload="none"'), 10)
        self.assertNotIn("autoplay", source)
        for sample in samples:
            path = ROOT / sample["src"]
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), sample["sha256"])
            self.assertIn(f'src="{sample["src"]}"', source)
            with wave.open(str(path)) as audio:
                self.assertGreater(audio.getnframes(), 0)
                self.assertAlmostEqual(audio.getnframes() / audio.getframerate(), sample["duration"], places=2)
            with urllib.request.urlopen(self.base + "/" + sample["src"]) as response:
                self.assertIn(response.headers.get_content_type(), {"audio/wav", "audio/x-wav", "audio/vnd.wave"})
                self.assertEqual(hashlib.sha256(response.read()).hexdigest(), sample["sha256"])

    def test_current_screenshot_inventory(self):
        inventory = json.loads((ROOT / "images/screenshots.json").read_text(encoding="utf-8"))
        self.assertEqual(len(inventory["screens"]), 10)
        for screen in inventory["screens"]:
            data = (ROOT / screen["src"]).read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", data[16:24]), (screen["width"], screen["height"]))
            self.assertEqual(hashlib.sha256(data).hexdigest(), screen["sha256"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
