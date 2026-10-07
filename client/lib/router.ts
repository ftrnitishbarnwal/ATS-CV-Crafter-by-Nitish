type Listener = (path: string) => void;
const listeners = new Set<Listener>();

export function currentPath(): string {
  return location.pathname.replace(/\/+$/, "") || "/";
}

export function navigate(path: string): void {
  if (currentPath() === path) return;
  history.pushState({}, "", path);
  window.scrollTo({ top: 0 });
  listeners.forEach((l) => l(path));
}

export function onRoute(l: Listener): () => void {
  listeners.add(l);
  const pop = () => l(currentPath());
  window.addEventListener("popstate", pop);
  return () => {
    listeners.delete(l);
    window.removeEventListener("popstate", pop);
  };
}
