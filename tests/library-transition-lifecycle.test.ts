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
  LIBRARY_TRANSITION_STANDIN_KEY,
} from "../src/lib/library-view-context";

interface PageOptions {
  storageUnavailable?: boolean;
  coverReady?: boolean;
  reduceMotion?: boolean;
  coverSrc?: string;
  // the hero/card is still inside React's hidden streaming container: "queued" waits in $RB for
  // the next frame's reveal, "stuck" has no runtime to flush
  streaming?: "queued" | "stuck";
}

interface FakeElement {
  tag: string;
  textContent: string;
  rel: string;
  href: string;
  src?: string;
  complete?: boolean;
  naturalWidth?: number;
  style: Record<string, string>;
  attrs: Map<string, string>;
  children: FakeElement[];
  parentElement: unknown;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  appendChild(child: FakeElement): FakeElement;
  querySelector(selector: string): FakeElement | null;
  getBoundingClientRect(): { width: number; height: number; top: number; bottom: number };
  remove(): void;
  removed?: boolean;
}

function createPage(
  path: string,
  values: Map<string, string>,
  previous = "http://bandi.test/",
  options: PageOptions = {},
) {
  const handlers = new Map<string, (event: unknown) => void>();
  const body = {};
  let streamed = options.streaming !== undefined;
  const cover = {
    style: { viewTransitionName: "" },
    parentElement: body,
    getBoundingClientRect: () => streamed
      ? { left: 0, width: 0, height: 0, top: 0, bottom: 0 }
      : { left: 40, width: 300, height: 180, top: 10, bottom: 190 },
    querySelector: (selector: string) => selector.startsWith("img") ? image : null,
  };
  const image = {
    complete: options.coverReady ?? false,
    naturalWidth: options.coverReady ? 400 : 0,
    parentElement: cover,
    currentSrc: options.coverSrc,
  };
  const copy = { style: { viewTransitionName: "" } };
  const card = { querySelector: (selector: string) => selector === ".bandi-library-cover" ? cover : null };
  const styles: string[] = [];
  const standIns: FakeElement[] = [];
  const expects: string[] = [];
  const createElement = (tag: string): FakeElement => {
    const element: FakeElement = {
      tag,
      textContent: "",
      rel: "",
      href: "",
      style: {},
      attrs: new Map(),
      children: [],
      parentElement: null,
      setAttribute: (key, value) => { element.attrs.set(key, value); },
      getAttribute: (key) => element.attrs.get(key) ?? null,
      appendChild: (child) => { child.parentElement = element; element.children.push(child); return child; },
      querySelector: (selector) => selector.startsWith("img") ? element.children.find((c) => c.tag === "img") ?? null : null,
      getBoundingClientRect: () => ({ width: 1270, height: 460, top: 108, bottom: 568 }),
      remove: () => { element.removed = true; },
    };
    if (tag === "img") {
      element.complete = true;
      element.naturalWidth = 400;
    }
    return element;
  };
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
    window: {
      navigation: { activation: { from: { url: previous } } },
      ...(options.streaming === "queued"
        ? { $RB: [1], $RV: (queue: unknown[]) => { streamed = false; queue.length = 0; } }
        : {}),
    },
    document: {
      body,
      querySelector: (selector: string) => {
        if (selector.startsWith("[data-bandi-library-card")) return card;
        if (selector === ".bandi-detail-cover") return cover;
        if (selector === ".bandi-detail-copy") return copy;
        return null;
      },
      createElement,
      head: { appendChild: (el: { tag?: string; textContent: string; href?: string }) => { if (el.tag === "link") expects.push(el.href ?? ""); else styles.push(el.textContent); } },
      documentElement: {
        clientWidth: 1280,
        appendChild: (host: FakeElement) => { host.parentElement = body; standIns.push(host); return host; },
      },
    },
    sessionStorage: storage,
    CSS: { supports: () => true },
    matchMedia: () => ({ matches: options.reduceMotion ?? false }),
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    innerHeight: 900,
    innerWidth: 1280,
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers.set(name, handler);
    },
    scrollTo: () => {},
    scrollY: 0,
    setTimeout: () => 0,
    requestAnimationFrame: () => 0,
    URL,
    URLSearchParams,
  });
  return {
    cover,
    copy,
    styles,
    standIns,
    expects,
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

test("an armed navigation bridges the streamed first paint with a cover stand-in", () => {
  const values = new Map<string, string>();
  const snapshot = createSnapshot();
  values.set(LIBRARY_RETURN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  values.set(LIBRARY_TRANSITION_ARM_KEY, String(snapshot.savedAt));
  const library = createPage("/library", values, "http://bandi.test/", { coverReady: true, coverSrc: "https://img.test/c-400.jpg" });
  assert.equal(library.standIns.length, 0, "a plain library visit never mounts a stand-in");
  assert.deepEqual(library.expects, [], "a plain visit never holds the first paint");
  library.fire("pageswap", {
    activation: { entry: { url: "http://bandi.test/anime/7" } },
    viewTransition: createTransition().event,
  });
  const stored = JSON.parse(values.get(LIBRARY_TRANSITION_STANDIN_KEY) ?? "null");
  assert.equal(stored.src, "https://img.test/c-400.jpg");
  assert.equal(stored.savedAt, snapshot.savedAt);

  // the real hero cannot be revealed before capture: the stand-in carries the shared name instead
  const detail = createPage("/anime/7", new Map(values), "http://bandi.test/library", { coverReady: false, streaming: "stuck" });
  assert.equal(detail.standIns.length, 1);
  assert.deepEqual(detail.expects, [], "the first paint is never held back");
  const hero = detail.standIns[0];
  assert.equal(hero.getAttribute("data-bandi-standin"), "hero");
  assert.equal(hero.children[0].src, "https://img.test/c-400.jpg");
  assert.match(
    detail.styles.join("\n"),
    /\.bandi-detail-cover\{background-image:url\("https:\/\/img\.test\/c-400\.jpg"\)/,
    "the real hero paints the same cached cover underneath its copy",
  );
  const transition = createTransition();
  detail.fire("pagereveal", { viewTransition: transition.event });
  assert.equal(transition.skipped(), 0);
  assert.equal(hero.style.viewTransitionName, "bandi-cover");
  assert.equal(detail.cover.style.viewTransitionName, "");
  assert.equal(detail.copy.style.viewTransitionName, "", "the copy fades in after the stand-in instead");

  // React's queued reveal is flushed before capture: the real hero and its copy morph together
  const flushed = createPage("/anime/7", values, "http://bandi.test/library", { coverReady: false, streaming: "queued" });
  assert.equal(flushed.standIns.length, 1);
  const flushedTransition = createTransition();
  flushed.fire("pagereveal", { viewTransition: flushedTransition.event });
  assert.equal(flushedTransition.skipped(), 0);
  assert.equal(flushed.cover.style.viewTransitionName, "bandi-cover");
  assert.equal(flushed.copy.style.viewTransitionName, "bandi-detail-copy");
  assert.equal(flushed.standIns[0].removed, true, "the stand-in leaves before capture");

  const other = createPage("/anime/8", values, "http://bandi.test/library", { coverReady: true });
  assert.equal(other.standIns.length, 0, "a different detail page gets no stand-in");
  const reduced = createPage("/anime/7", new Map(values), "http://bandi.test/library", { coverReady: true, reduceMotion: true });
  assert.equal(reduced.standIns.length, 0, "reduced motion keeps ordinary navigation");

  // going back with a visible hero keeps the stand-in data for the card-side bridge
  const visibleDetail = createPage("/anime/7", values, "http://bandi.test/library", { coverReady: true });
  visibleDetail.fire("pageswap", {
    activation: { entry: { url: "http://bandi.test/library" } },
    viewTransition: createTransition().event,
  });
  const queuedReturn = createPage("/library", new Map(values), "http://bandi.test/anime/7", { coverReady: false, streaming: "queued" });
  const queuedBack = createTransition();
  queuedReturn.fire("pagereveal", { viewTransition: queuedBack.event });
  assert.equal(queuedReturn.cover.style.viewTransitionName, "bandi-cover", "a flushed card morphs itself");
  assert.equal(queuedReturn.standIns[0].removed, true);
  const returned = createPage("/library", values, "http://bandi.test/anime/7", { coverReady: false, streaming: "stuck" });
  assert.equal(returned.standIns.length, 1);
  assert.equal(returned.standIns[0].getAttribute("data-bandi-standin"), "card");
  assert.match(returned.standIns[0].style.cssText ?? "", /top:250px/, "the card stand-in sits at the remembered card top");
  const back = createTransition();
  returned.fire("pagereveal", { viewTransition: back.event });
  assert.equal(back.skipped(), 0);
  assert.equal(returned.standIns[0].style.viewTransitionName, "bandi-cover");
  assert.equal(values.has(LIBRARY_TRANSITION_STANDIN_KEY), false, "stand-in data is single use");
});
