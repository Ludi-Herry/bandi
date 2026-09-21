import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { libraryDetailTransitionScript } from "../src/lib/library-detail-transition";
import {
  LIBRARY_RETURN_PENDING_KEY,
  LIBRARY_RETURN_SNAPSHOT_KEY,
  LIBRARY_TRANSITION_ARM_KEY,
  LIBRARY_TRANSITION_COVER_KEY,
  LIBRARY_TRANSITION_DETAIL_KEY,
} from "../src/lib/library-view-context";

interface PageOptions {
  storageUnavailable?: boolean;
  coverReady?: boolean;
  reduceMotion?: boolean;
}

function createPage(
  path: string,
  values: Map<string, string>,
  previous = "http://bandi.test/",
  options: PageOptions = {},
) {
  const handlers = new Map<string, (event: unknown) => void>();
  const body = {};
  const cover = {
    style: { viewTransitionName: "" },
    parentElement: body,
    getBoundingClientRect: () => ({ width: 300, height: 180, top: 10, bottom: 190 }),
    querySelector: (selector: string) => selector.startsWith("img") ? image : null,
  };
  const image = {
    complete: options.coverReady ?? false,
    naturalWidth: options.coverReady ? 400 : 0,
    parentElement: cover,
  };
  const copy = { style: { viewTransitionName: "" } };
  const card = { querySelector: (selector: string) => selector === ".bandi-library-cover" ? cover : null };
  const styles: string[] = [];
  const storage = {
    getItem: (key: string) => {
      if (options.storageUnavailable) throw new Error("storage disabled");
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.storageUnavailable) throw new Error("storage disabled");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (options.storageUnavailable) throw new Error("storage disabled");
      values.delete(key);
    },
  };
  runInNewContext(libraryDetailTransitionScript, {
    location: { pathname: path, search: "" },
    window: { navigation: { activation: { from: { url: previous } } } },
    document: {
      body,
      querySelector: (selector: string) => {
        if (selector.startsWith("[data-bandi-library-card")) return card;
        if (selector === ".bandi-detail-cover") return cover;
        if (selector === ".bandi-detail-copy") return copy;
        return null;
      },
      createElement: () => ({ textContent: "" }),
      head: { appendChild: (style: { textContent: string }) => { styles.push(style.textContent); } },
    },
    sessionStorage: storage,
    CSS: { supports: () => true },
    matchMedia: () => ({ matches: options.reduceMotion ?? false }),
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    innerHeight: 900,
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler);
    },
    scrollTo: () => {},
    scrollY: 0,
    URL,
    URLSearchParams,
  });
  return {
    cover,
    copy,
    styles,
    fire(name: string, event: unknown) {
      const handler = handlers.get(name);
      assert.ok(handler, `${name} handler exists`);
      handler(event);
    },
  };
}

function createTransition() {
  let skipped = 0;
  return {
    event: {
      ready: new Promise<void>(() => {}),
      finished: new Promise<void>(() => {}),
      skipTransition: () => { skipped += 1; },
    },
    skipped: () => skipped,
  };
}

function createSnapshot() {
  return {
    version: 1,
    id: 7,
    context: { status: "all", type: "all", year: "all", sort: "updated", view: "grid" },
    scrollTop: 420,
    cardTop: 250,
    focus: false,
    savedAt: Date.now(),
  };
}

test("only the armed library grid click can use the shared cover and return snapshot", () => {
  const values = new Map<string, string>();
  const snapshot = createSnapshot();
  values.set(LIBRARY_RETURN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  values.set(LIBRARY_TRANSITION_ARM_KEY, String(snapshot.savedAt));
  const library = createPage("/library", values);
  library.fire("pageswap", { activation: { entry: { url: "http://bandi.test/anime/7" } } });
  assert.equal(values.has(LIBRARY_TRANSITION_ARM_KEY), false);
  assert.equal(values.get(LIBRARY_TRANSITION_DETAIL_KEY), String(snapshot.savedAt));

  const detail = createPage("/anime/7", values, "http://bandi.test/library");
  detail.fire("pageswap", { activation: { entry: { url: "http://bandi.test/library" } } });
  assert.equal(values.has(LIBRARY_RETURN_SNAPSHOT_KEY), false);
  assert.equal(values.has(LIBRARY_TRANSITION_DETAIL_KEY), false);
  assert.deepEqual(JSON.parse(values.get(LIBRARY_RETURN_PENDING_KEY) ?? "null"), {
    ...snapshot,
    returnCoverReady: false,
  });

  const returned = createPage("/library", values, "http://bandi.test/anime/7");
  returned.fire("pagereveal", {});
  let skipped = 0;
  returned.fire("pageswap", {
    activation: { entry: { url: "http://bandi.test/anime/7" } },
    viewTransition: { skipTransition: () => { skipped += 1; } },
  });
  assert.equal(skipped, 1, "a later Recently Added link to the same anime is not armed");
  assert.equal(values.has(LIBRARY_RETURN_PENDING_KEY), false, "stale return state is discarded");
});

test("unavailable session storage cannot block native navigation", () => {
  const values = new Map<string, string>();
  const page = createPage("/library", values, "http://bandi.test/", { storageUnavailable: true });
  let skipped = 0;
  page.fire("pageswap", {
    activation: { entry: { url: "http://bandi.test/anime/7" } },
    viewTransition: { skipTransition: () => { skipped += 1; } },
  });
  assert.equal(skipped, 1);
});

test("shared cover and detail copy require visible images on both sides", () => {
  for (const [sourceReady, targetReady, expectedSkip] of [
    [true, true, 0],
    [false, true, 0],
    [true, false, 1],
    [false, false, 0],
  ] as const) {
    const values = new Map<string, string>();
    const snapshot = createSnapshot();
    values.set(LIBRARY_RETURN_SNAPSHOT_KEY, JSON.stringify(snapshot));
    values.set(LIBRARY_TRANSITION_ARM_KEY, String(snapshot.savedAt));
    const source = createPage("/library", values, "http://bandi.test/", { coverReady: sourceReady });
    const sourceTransition = createTransition();
    source.fire("pageswap", {
      activation: { entry: { url: "http://bandi.test/anime/7" } },
      viewTransition: sourceTransition.event,
    });
    assert.equal(values.has(LIBRARY_TRANSITION_COVER_KEY), sourceReady);
    assert.equal(source.cover.style.viewTransitionName, sourceReady ? "bandi-cover" : "");

    const target = createPage("/anime/7", values, "http://bandi.test/library", { coverReady: targetReady });
    const targetTransition = createTransition();
    target.fire("pagereveal", { viewTransition: targetTransition.event });
    const shared = sourceReady && targetReady;
    assert.equal(target.cover.style.viewTransitionName, shared ? "bandi-cover" : "");
    assert.equal(target.copy.style.viewTransitionName, shared ? "bandi-detail-copy" : "");
    assert.equal(targetTransition.skipped(), expectedSkip);
    assert.match(target.styles.join("\n"), /bandi-detail-copy-enter 320ms/);
  }
});

test("return skips a one-sided cover, and reduced motion leaves only native navigation", () => {
  const values = new Map<string, string>();
  const snapshot = createSnapshot();
  values.set(LIBRARY_RETURN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  values.set(LIBRARY_TRANSITION_DETAIL_KEY, String(snapshot.savedAt));
  const detail = createPage("/anime/7", values, "http://bandi.test/library", { coverReady: true });
  detail.fire("pageswap", {
    activation: { entry: { url: "http://bandi.test/library" } },
    viewTransition: createTransition().event,
  });
  assert.equal(detail.copy.style.viewTransitionName, "bandi-detail-copy");
  const returned = createPage("/library", values, "http://bandi.test/anime/7", { coverReady: false });
  const returnTransition = createTransition();
  returned.fire("pagereveal", { viewTransition: returnTransition.event });
  assert.equal(returnTransition.skipped(), 1);
  assert.equal(returned.cover.style.viewTransitionName, "");

  const reducedValues = new Map<string, string>();
  const reducedSnapshot = createSnapshot();
  reducedValues.set(LIBRARY_RETURN_SNAPSHOT_KEY, JSON.stringify(reducedSnapshot));
  reducedValues.set(LIBRARY_TRANSITION_ARM_KEY, String(reducedSnapshot.savedAt));
  const reducedSource = createPage("/library", reducedValues, "http://bandi.test/", {
    coverReady: true,
    reduceMotion: true,
  });
  reducedSource.fire("pageswap", { activation: { entry: { url: "http://bandi.test/anime/7" } } });
  assert.equal(reducedSource.styles.length, 0);
  assert.equal(reducedSource.cover.style.viewTransitionName, "");
  assert.equal(reducedValues.has(LIBRARY_TRANSITION_COVER_KEY), false);
  const reducedDetail = createPage("/anime/7", reducedValues, "http://bandi.test/library", {
    coverReady: true,
    reduceMotion: true,
  });
  reducedDetail.fire("pageswap", { activation: { entry: { url: "http://bandi.test/library" } } });
  assert.equal(JSON.parse(reducedValues.get(LIBRARY_RETURN_PENDING_KEY) ?? "null").returnCoverReady, false);
  const reducedReturn = createPage("/library", reducedValues, "http://bandi.test/anime/7", {
    coverReady: true,
    reduceMotion: true,
  });
  reducedReturn.fire("pageshow", { persisted: true });
  assert.equal(reducedValues.has(LIBRARY_RETURN_PENDING_KEY), false);
});
