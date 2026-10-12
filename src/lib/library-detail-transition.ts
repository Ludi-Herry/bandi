import {
  LIBRARY_RETURN_PENDING_KEY,
  LIBRARY_RETURN_SNAPSHOT_KEY,
  LIBRARY_TRANSITION_ARM_KEY,
  LIBRARY_TRANSITION_COVER_KEY,
  LIBRARY_TRANSITION_DETAIL_KEY,
  LIBRARY_TRANSITION_STANDIN_KEY,
} from "./library-view-context";

/** Runs in a classic head script so pagereveal is registered before first paint. */
export const libraryDetailTransitionScript = String.raw`(() => {
  const SNAPSHOT_KEY = ${JSON.stringify(LIBRARY_RETURN_SNAPSHOT_KEY)};
  const PENDING_KEY = ${JSON.stringify(LIBRARY_RETURN_PENDING_KEY)};
  const ARM_KEY = ${JSON.stringify(LIBRARY_TRANSITION_ARM_KEY)};
  const COVER_KEY = ${JSON.stringify(LIBRARY_TRANSITION_COVER_KEY)};
  const DETAIL_KEY = ${JSON.stringify(LIBRARY_TRANSITION_DETAIL_KEY)};
  const STANDIN_KEY = ${JSON.stringify(LIBRARY_TRANSITION_STANDIN_KEY)};
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
      sessionStorage.removeItem(STANDIN_KEY);
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

  // Streaming SSR paints the loading skeleton first: at pagereveal the real hero/card is still
  // missing or parked in a hidden streaming container, so the shared cover had nothing to morph
  // into. A fixed stand-in with the same (already cached) cover is painted from the very first
  // frame, carries the shared name, and hands over to the real element once it is visible.
  const readStandIn = (snapshot) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(STANDIN_KEY) || "null");
      if (!value || !snapshot || value.savedAt !== snapshot.savedAt || typeof value.src !== "string" || !value.src) return null;
      const rectOk = (r) => r && [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
      return rectOk(value.card) && rectOk(value.hero) ? value : null;
    } catch { return null; }
  };
  const mountStandIn = (data, rect, kind, id) => {
    try {
      const target = kind === "hero"
        ? ".bandi-detail-cover"
        : '[data-bandi-library-card="' + id + '"] .bandi-library-cover';
      const underlay = document.createElement("style");
      underlay.textContent = target + "{background-image:url(" + JSON.stringify(data.src) + ");background-size:cover;background-position:center}"
        + target + " .t-skel-skeleton{opacity:0!important}";
      document.head.appendChild(underlay);
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.setAttribute("data-bandi-standin", kind);
      host.style.cssText = "position:fixed;z-index:30;pointer-events:none;overflow:hidden;background:#141416;"
        + "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;"
        + "border-radius:" + (kind === "card" ? 8 : 0) + "px;transition:opacity 160ms ease-out";
      const image = document.createElement("img");
      image.alt = "";
      image.decoding = "sync";
      image.src = data.src;
      image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
      host.appendChild(image);
      if (kind === "hero") {
        for (const background of [
          "linear-gradient(90deg, rgba(10,10,11,0.95) 0%, rgba(10,10,11,0.75) 35%, rgba(10,10,11,0.15) 65%, rgba(10,10,11,0) 100%)",
          "linear-gradient(180deg, rgba(10,10,11,0) 65%, rgba(10,10,11,1) 100%)",
        ]) {
          const shade = document.createElement("div");
          shade.style.cssText = "position:absolute;inset:0;background:" + background;
          host.appendChild(shade);
        }
      }
      document.documentElement.appendChild(host);
      return host;
    } catch { return null; }
  };
  const onScreen = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  // React 19 batches streamed Suspense reveals ($RB) until the next animation frame, which runs
  // after a cross-document view transition has captured the new page. Running the already queued
  // reveal now only moves parsed DOM into place (the later frame callback then finds an empty
  // queue), so the streamed hero/card is part of the capture. Absent or reshaped runtime: no-op,
  // and the stand-in covers the gap.
  const flushStreamedReveals = () => {
    try {
      if (typeof window.$RV === "function" && Array.isArray(window.$RB) && window.$RB.length > 0) window.$RV(window.$RB);
    } catch {}
  };
  // Hand over to the real element as soon as it is on screen: it already paints the same cover
  // underneath its own copy. Instant when the copy morphed in with the transition, otherwise a
  // short fade so the streamed copy does not pop (5s safety limit; user input also retires it).
  const retireStandIn = (standIn, real, transition, instant) => {
    if (!standIn) return;
    let done = false;
    const started = Date.now();
    const remove = (now) => {
      if (done) return;
      done = true;
      if (now) { standIn.remove(); return; }
      standIn.style.opacity = "0";
      setTimeout(() => standIn.remove(), 200);
    };
    for (const name of ["wheel", "keydown", "pointerdown", "touchstart"]) addEventListener(name, () => remove(true), { once: true, capture: true });
    const watch = () => {
      if (done) return;
      if (onScreen(real())) remove(instant);
      else if (Date.now() - started > 5000) remove(false);
      else requestAnimationFrame(watch);
    };
    Promise.resolve(transition?.finished).catch(() => {}).finally(watch);
  };
  let standIn = null;
  if (!reduceMotion && CSS.supports("view-transition-name", "bandi-cover")) {
    if (detailId(path)) {
      const snapshot = readSnapshot();
      const data = snapshot && String(snapshot.id) === detailId(path) && hasMarker(DETAIL_KEY, snapshot) && hasMarker(COVER_KEY, snapshot)
        ? readStandIn(snapshot) : null;
      if (data) standIn = mountStandIn(data, data.hero, "hero", snapshot.id);
    } else if (isLibrary(path)) {
      const snapshot = readSnapshot(PENDING_KEY);
      const data = snapshot && snapshot.returnCoverReady === true ? readStandIn(snapshot) : null;
      if (data) standIn = mountStandIn(data, { ...data.card, top: Number.isFinite(snapshot.cardTop) ? snapshot.cardTop : data.card.top }, "card", snapshot.id);
    }
  }

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
      if (coverMarked) {
        nameElement(cover, "bandi-cover", event.viewTransition, "out");
        try {
          const image = cover.querySelector("img:not([aria-hidden])");
          const card = cover.getBoundingClientRect();
          const scroller = document.querySelector(".desktop-page-scroll");
          const area = scroller?.getBoundingClientRect();
          sessionStorage.setItem(STANDIN_KEY, JSON.stringify({
            savedAt: snapshot.savedAt,
            src: image.currentSrc || image.src,
            card: { left: card.left, top: card.top, width: card.width, height: card.height },
            hero: {
              left: area ? area.left : 0,
              top: area ? area.top : 64,
              width: scroller ? scroller.clientWidth : document.documentElement.clientWidth,
              height: innerWidth >= 640 ? 460 : 430,
            },
          }));
        } catch {}
      }
    } else if (detailId(path) && isLibrary(destination)) {
      if (!hasMarker(DETAIL_KEY, snapshot) || String(snapshot.id) !== detailId(path)) {
        clearPilot();
        event.viewTransition?.skipTransition();
        return;
      }
      const cover = heroCover();
      let standInData = null;
      try { standInData = sessionStorage.getItem(STANDIN_KEY); } catch {}
      // after an armed arrival the hero paints the cached cover underneath, so it counts as ready
      // even while the full-size image is still loading
      const ready = !reduceMotion && (imageReady(cover) || (!!standInData && onScreen(cover)));
      clearPilot();
      if (ready && standInData) {
        try { sessionStorage.setItem(STANDIN_KEY, standInData); } catch {}
      }
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
        if (standIn) flushStreamedReveals();
        // the real hero, once on screen, already paints the cached cover underneath, so it can
        // carry the shared name itself and the copy morphs in with it; otherwise the stand-in does
        const realOnScreen = !!standIn && onScreen(heroCover());
        if (realOnScreen) standIn.remove();
        const cover = realOnScreen ? heroCover() : standIn || heroCover();
        const sourceReady = hasMarker(COVER_KEY, snapshot);
        const targetReady = realOnScreen || imageReady(cover);
        let copyMorphs = false;
        if (sourceReady && targetReady) {
          nameElement(cover, "bandi-cover", event.viewTransition, "in");
          copyMorphs = realOnScreen || (!standIn && imageReady(heroCover()));
          if (copyMorphs) nameElement(detailCopy(), "bandi-detail-copy", event.viewTransition, "in");
        } else if (sourceReady && !targetReady) {
          event.viewTransition?.skipTransition();
        }
        if (!realOnScreen) retireStandIn(standIn, heroCover, targetReady ? event.viewTransition : null, copyMorphs);
      }
    } else if (isLibrary(path) && detailId(previous)) {
      if (!snapshot || String(snapshot.id) !== detailId(previous)) {
        event.viewTransition?.skipTransition();
        return;
      }
      if (standIn) flushStreamedReveals();
      const realCover = cardCover(snapshot.id);
      const contextMatches = contextMatchesUrl(snapshot.context);
      if (contextMatches) restoreScroll(snapshot, realCover);
      // same hand-over as the detail side: a visible real card already paints the cached cover
      const realOnScreen = !!standIn && contextMatches && onScreen(cardCover(snapshot.id));
      if (realOnScreen) standIn.remove();
      const cover = realOnScreen ? cardCover(snapshot.id) : standIn || realCover;
      try { sessionStorage.removeItem(STANDIN_KEY); } catch {}
      if (!reduceMotion && snapshot.returnCoverReady === true) {
        const shared = contextMatches && (realOnScreen || imageReady(cover));
        if (shared) nameElement(cover, "bandi-cover", event.viewTransition, "in");
        else event.viewTransition?.skipTransition();
        if (!realOnScreen) retireStandIn(standIn, () => cardCover(snapshot.id), shared ? event.viewTransition : null, true);
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
