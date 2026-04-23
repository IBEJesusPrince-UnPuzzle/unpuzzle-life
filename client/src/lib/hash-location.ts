import { useSyncExternalStore } from "react";

// wouter's default useHashLocation returns the raw hash-path including any
// `?query` portion — e.g. for `#/horizons?areaId=4` it returns
// `/horizons?areaId=4`. wouter's Route matcher (regexparam) does NOT strip
// the query, so `<Route path="/horizons">` fails to match and the user
// lands on the <NotFound /> catch-all on hard refresh.
//
// This wrapper strips the query string from the path so Route matching
// works, while leaving `window.location.hash` intact for components that
// parse the query themselves (e.g. HorizonsPage reads `?areaId=` off the
// hash to restore portal state after refresh).

const listeners: Array<() => void> = [];

const onHashChange = () => listeners.forEach((cb) => cb());

const subscribe = (callback: () => void) => {
  if (listeners.push(callback) === 1) {
    window.addEventListener("hashchange", onHashChange);
  }
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
    if (!listeners.length) window.removeEventListener("hashchange", onHashChange);
  };
};

const currentPath = (): string => {
  const raw = window.location.hash.replace(/^#?\/?/, "");
  const [path] = raw.split("?");
  return "/" + path;
};

export const navigate = (
  to: string,
  { state = null, replace = false }: { state?: unknown; replace?: boolean } = {},
) => {
  const oldURL = window.location.href;
  const [hashPart, search] = to.replace(/^#?\/?/, "").split("?");
  const url = new URL(window.location.href);
  url.hash = `/${hashPart}`;
  if (search) url.search = search;
  const newURL = url.href;
  if (replace) {
    window.history.replaceState(state, "", newURL);
  } else {
    window.history.pushState(state, "", newURL);
  }
  const event =
    typeof HashChangeEvent !== "undefined"
      ? new HashChangeEvent("hashchange", { oldURL, newURL })
      : new Event("hashchange");
  window.dispatchEvent(event);
};

export const useHashLocation = (): [string, typeof navigate] => [
  useSyncExternalStore(subscribe, currentPath, () => "/"),
  navigate,
];

useHashLocation.hrefs = (href: string) => "#" + href;
