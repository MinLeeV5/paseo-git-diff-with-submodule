import { expect, it } from "vitest";
import { type DiffRevealState, shouldRevealDiff } from "../client/diff-model";

const initial: DiffRevealState = {
  path: "src/file.ts",
  mode: "split",
  wrap: false,
  index: 0,
  request: 0,
  selection: null,
};

it("reveals the initial target, then preserves scroll through repeated refresh renders", () => {
  expect(shouldRevealDiff(null, initial)).toBe(true);
  let previous = initial;
  for (let render = 0; render < 4; render++) {
    const next = { ...initial };
    expect(shouldRevealDiff(previous, next)).toBe(false);
    previous = next;
  }
});

it("preserves scroll when refresh clears a selected marker's stale rows", () => {
  const selected = { ...initial, selection: { index: 200 } };
  expect(shouldRevealDiff(initial, selected)).toBe(true);
  expect(shouldRevealDiff(selected, { ...selected })).toBe(false);
  expect(shouldRevealDiff(selected, initial)).toBe(false);
  expect(shouldRevealDiff(initial, { ...initial })).toBe(false);
});

it("reveals every explicit marker click, including selecting the same row again", () => {
  const selected = { ...initial, selection: { index: 200 } };
  expect(shouldRevealDiff(selected, { ...selected, selection: { index: 200 } })).toBe(true);
  expect(shouldRevealDiff(selected, { ...selected, selection: { index: 400 } })).toBe(true);
});

it.each<Partial<DiffRevealState>>([
  { path: "src/other.ts" },
  { mode: "unified" },
  { wrap: true },
  { index: 1 },
  { request: 1 },
])("reveals the target for a file, layout or navigation change: %j", (change) => {
  expect(shouldRevealDiff(initial, { ...initial, ...change })).toBe(true);
});
