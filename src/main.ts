import { mount } from "svelte";
import "./App.css";
import "./theme.css";
import App from "./App.svelte";
import {
  readStoredThemePreference,
  resolveAppearance,
} from "./lib/monacoThemes";

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
