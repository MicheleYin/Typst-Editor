/**
 * iPad / iPadOS (Safari, WKWebView), including "Request Desktop Website"
 * (often reports as MacIntel with touch). Excludes iPhone / iPod.
 */
export function isIpadOs(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
