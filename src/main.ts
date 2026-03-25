import "./monaco-env";
import { mount } from "svelte";
import "./App.css";
import "./theme.css";
import App from "./App.svelte";
import {
  readStoredThemePreference,
  resolveAppearance,
} from "./lib/monacoThemes";

/** iOS Safari/WKWebView: stop double-tap zoom; use in-app View → Zoom instead. */
function preventIosDoubleTapZoom() {
  if (typeof window === "undefined") return;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return;
  let m = document.querySelector('meta[name="viewport"]');
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", "viewport");
    document.head.appendChild(m);
  }
  m.setAttribute(
    "content",
    "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no",
  );
  document.documentElement.style.touchAction = "manipulation";
  document.body.style.touchAction = "manipulation";
}

preventIosDoubleTapZoom();

const sysDark =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.appAppearance = resolveAppearance(
  readStoredThemePreference(),
  sysDark,
);

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
