import {
  LIBRARY_RETURN_PENDING_KEY,
  LIBRARY_RETURN_SNAPSHOT_KEY,
  LIBRARY_TRANSITION_ARM_KEY,
  LIBRARY_TRANSITION_COVER_KEY,
  LIBRARY_TRANSITION_DETAIL_KEY,
} from "./library-view-context";

/** Runs in a classic head script so pagereveal is registered before first paint. */
export const libraryDetailTransitionScript = String.raw`(() => {
  const SNAPSHOT_KEY = ${JSON.stringify(LIBRARY_RETURN_SNAPSHOT_KEY)};
  const PENDING_KEY = ${JSON.stringify(LIBRARY_RETURN_PENDING_KEY)};
  const ARM_KEY = ${JSON.stringify(LIBRARY_TRANSITION_ARM_KEY)};
  const COVER_KEY = ${JSON.stringify(LIBRARY_TRANSITION_COVER_KEY)};
  const DETAIL_KEY = ${JSON.stringify(LIBRARY_TRANSITION_DETAIL_KEY)};
  const detailId = (path) => /^\/anime\/([1-9]\d*)\/?$/.exec(path)?.[1] ?? null;
  const isLibrary = (path) => path === "/library" || path === "/library/";
  const path = location.pathname;
  if (!isLibrary(path) && !detailId(path)) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && CSS.supports("view-transition-name", "bandi-cover")) {
    const style = document.createElement("style");
    style.textContent = [
      "@view-transition { navigation: auto; }",
      "::view-transition-old(root), ::view-transition-new(root) { animation-duration: 160ms; }",
      "::view-transition-group(bandi-cover) { animation-duration: 450ms; animation-timing-function: cubic-bezier(.22,1,.36,1); }",
      "::view-transition-old(bandi-cover), ::view-transition-new(bandi-cover) { animation-duration: 450ms; animation-timing-function: cubic-bezier(.22,1,.36,1); }",
      "@keyframes bandi-detail-copy-enter { from { opacity: 0; transform: translateY(9px) scale(.997); } to { opacity: 1; transform: translateY(0) scale(1); } }",
      "@keyframes bandi-detail-copy-exit { to { opacity: 0; } }",
      "::view-transition-new(bandi-detail-copy) { animation: bandi-detail-copy-enter 320ms cubic-bezier(.22,1,.36,1) 110ms both; }",
      "::view-transition-old(bandi-detail-copy) { animation: bandi-detail-copy-exit 120ms ease-out both; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  const readSnapshot = (key = SNAPSHOT_KEY) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!value || value.version !== 1 || !Number.isSafeInteger(value.id) || value.id <= 0) return null;
      if (!Number.isFinite(value.scrollTop) || value.scrollTop < 0) return null;
      if (value.cardTop != null && !Number.isFinite(value.cardTop)) return null;
      if (!Number.isFinite(value.savedAt) || Math.abs(Date.now() - value.savedAt) > 7200000) return null;
      return value;
    } catch { return null; }
  };
  const hasMarker = (key, snapshot) => {
    try { return !!snapshot && sessionStorage.getItem(key) === String(snapshot.savedAt); }
    catch { return false; }
  };
  const clearPilot = () => {
    try {
      sessionStorage.removeItem(ARM_KEY);
      sessionStorage.removeItem(COVER_KEY);
      sessionStorage.removeItem(DETAIL_KEY);
      sessionStorage.removeItem(SNAPSHOT_KEY);
      sessionStorage.removeItem(PENDING_KEY);
    } catch {}
  };
  const cardFor = (id) => document.querySelector('[data-bandi-library-card="' + id + '"]');
  const cardCover = (id) => cardFor(id)?.querySelector(".bandi-library-cover") ?? null;
  const heroCover = () => document.querySelector(".bandi-detail-cover");
  const detailCopy = () => document.querySelector(".bandi-detail-copy");
  const imageReady = (cover) => {
    const image = cover?.querySelector("img:not([aria-hidden])");
    if (!image || !image.complete || image.naturalWidth <= 0) return false;
    const rect = cover.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) return false;
    for (let node = image; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.01) return false;
    }
    return true;
  };
  const nameElement = (element, name, transition, stage) => {
    if (!element || !transition) return;
    element.style.viewTransitionName = name;
    const completion = stage === "out" ? transition.finished : transition.ready;
    Promise.resolve(completion).catch(() => {}).finally(() => {
      element.style.viewTransitionName = "";
    });
  };
  const urlPath = (value) => {
    try { return new URL(value).pathname; } catch { return ""; }
  };
  const contextMatchesUrl = (context) => {
    if (!context || typeof context !== "object") return false;
    const params = new URLSearchParams(location.search);
    const defaults = { status: "all", type: "all", year: "all", sort: "updated", view: "grid" };
    return Object.keys(defaults).every((key) => (params.get(key) || defaults[key]) === context[key]);
  };
  const restoreScroll = (snapshot, cover) => {
    const scroller = document.querySelector(".desktop-page-scroll");
    const difference = cover && Number.isFinite(snapshot.cardTop)
      ? cover.getBoundingClientRect().top - snapshot.cardTop
      : null;
    if (scroller) scroller.scrollTop = difference == null ? snapshot.scrollTop : scroller.scrollTop + difference;
    else scrollTo(0, difference == null ? snapshot.scrollTop : scrollY + difference);
  };

  addEventListener("pageswap", (event) => {
    const destination = urlPath(event.activation?.entry?.url);
    const snapshot = readSnapshot();
    if (isLibrary(path) && detailId(destination)) {
      const armed = hasMarker(ARM_KEY, snapshot);
      try { sessionStorage.removeItem(ARM_KEY); } catch {}
      if (!armed || String(snapshot.id) !== detailId(destination)) {
        clearPilot();
        event.viewTransition?.skipTransition();
        return;
      }
      let detailMarked = false;
      try {
        sessionStorage.removeItem(PENDING_KEY);
        sessionStorage.setItem(DETAIL_KEY, String(snapshot.savedAt));
        detailMarked = true;
      } catch {}
      if (!detailMarked) {
        clearPilot();
        return;
      }
      const cover = cardCover(snapshot.id);
      const ready = !reduceMotion && imageReady(cover);
      let coverMarked = false;
      try {
        if (ready) {
          sessionStorage.setItem(COVER_KEY, String(snapshot.savedAt));
          coverMarked = true;
        }
        else sessionStorage.removeItem(COVER_KEY);
      } catch {}
      if (coverMarked) nameElement(cover, "bandi-cover", event.viewTransition, "out");
    } else if (detailId(path) && isLibrary(destination)) {
      if (!hasMarker(DETAIL_KEY, snapshot) || String(snapshot.id) !== detailId(path)) {
        clearPilot();
        event.viewTransition?.skipTransition();
        return;
      }
      const cover = heroCover();
      const ready = !reduceMotion && imageReady(cover);
      clearPilot();
      let pendingStored = false;
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...snapshot, returnCoverReady: ready }));
        pendingStored = true;
      } catch {}
      if (ready && pendingStored) {
        nameElement(cover, "bandi-cover", event.viewTransition, "out");
        nameElement(detailCopy(), "bandi-detail-copy", event.viewTransition, "out");
      }
    } else {
      clearPilot();
      event.viewTransition?.skipTransition();
    }
  });

  addEventListener("pagereveal", (event) => {
    const previous = urlPath(window.navigation?.activation?.from?.url);
    const snapshot = readSnapshot(isLibrary(path) ? PENDING_KEY : SNAPSHOT_KEY);
    if (detailId(path) && isLibrary(previous)) {
      if (!hasMarker(DETAIL_KEY, snapshot) || String(snapshot.id) !== detailId(path)) {
        event.viewTransition?.skipTransition();
        return;
      }
      if (!reduceMotion) {
        const cover = heroCover();
        const sourceReady = hasMarker(COVER_KEY, snapshot);
        const targetReady = imageReady(cover);
        if (sourceReady && targetReady) {
          nameElement(cover, "bandi-cover", event.viewTransition, "in");
          nameElement(detailCopy(), "bandi-detail-copy", event.viewTransition, "in");
        } else if (sourceReady && !targetReady) {
          event.viewTransition?.skipTransition();
        }
      }
    } else if (isLibrary(path) && detailId(previous)) {
      if (!snapshot || String(snapshot.id) !== detailId(previous)) {
        event.viewTransition?.skipTransition();
        return;
      }
      const cover = cardCover(snapshot.id);
      const contextMatches = contextMatchesUrl(snapshot.context);
      if (contextMatches) restoreScroll(snapshot, cover);
      if (!reduceMotion && snapshot.returnCoverReady === true) {
        if (contextMatches && imageReady(cover)) nameElement(cover, "bandi-cover", event.viewTransition, "in");
        else event.viewTransition?.skipTransition();
      }
      if (contextMatches && snapshot.focus) {
        const focus = () => cardFor(snapshot.id)?.querySelector("a[data-bandi-card-link]")?.focus({ preventScroll: true });
        if (event.viewTransition) Promise.resolve(event.viewTransition.finished).catch(() => {}).finally(focus);
        else requestAnimationFrame(focus);
      }
    } else {
      event.viewTransition?.skipTransition();
    }
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted && isLibrary(path)) {
      try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    }
  });
})();`;
