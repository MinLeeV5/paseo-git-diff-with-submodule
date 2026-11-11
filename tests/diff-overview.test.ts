import { expect, it } from "vitest";
import { buildDiffRows } from "../client/diff-model";
import {
  diffChangeRanges,
  diffOverviewMarkers,
  estimateDiffRowHeights,
} from "../client/diff-overview-model";
import { parseHunks } from "../server/parsers";

const patch = [
  "@@ -1,5 +1,4 @@",
  " unchanged",
  "-old one",
  "-old two",
  "+new one",
  " context",
  "-deleted",
  "@@ -100,0 +100,2 @@",
  "+new near end",
  "+another new line",
  "\\ No newline at end of file",
].join("\n");

it("maps split replacements to separate overlapping red and green ranges", () => {
  const rows = buildDiffRows(parseHunks(patch), true);
  expect(diffChangeRanges(rows)).toEqual([
    { kind: "removed", start: 2, end: 3, firstLine: 2, lastLine: 3, hunk: 0 },
    { kind: "added", start: 2, end: 2, firstLine: 2, lastLine: 2, hunk: 0 },
    { kind: "removed", start: 5, end: 5, firstLine: 5, lastLine: 5, hunk: 0 },
    { kind: "added", start: 7, end: 8, firstLine: 100, lastLine: 101, hunk: 1 },
  ]);
});

it("preserves unified row targets, separating context and hunk boundaries", () => {
  const rows = buildDiffRows(parseHunks(patch), false);
  expect(diffChangeRanges(rows)).toEqual([
    { kind: "removed", start: 2, end: 3, firstLine: 2, lastLine: 3, hunk: 0 },
    { kind: "added", start: 4, end: 4, firstLine: 2, lastLine: 2, hunk: 0 },
    { kind: "removed", start: 6, end: 6, firstLine: 5, lastLine: 5, hunk: 0 },
    { kind: "added", start: 8, end: 9, firstLine: 100, lastLine: 101, hunk: 1 },
  ]);
});

it("has no markers for empty, metadata-only or unchanged diffs", () => {
  expect(diffChangeRanges([])).toEqual([]);
  const rows = buildDiffRows(
    parseHunks("@@ -1 +1 @@\n context\n\\ No newline at end of file"),
    false,
  );
  expect(diffChangeRanges(rows)).toEqual([]);
});

it("keeps first and last changes visible in tiny and resized overview tracks", () => {
  const rows = buildDiffRows(parseHunks("@@ -1 +1 @@\n-old\n+new"), false);
  const ranges = diffChangeRanges(rows);
  const sizes = [
    { index: 0, offset: 0, length: 28 },
    { index: 1, offset: 28, length: 22 },
    { index: 2, offset: 50, length: 22 },
  ];
  for (const height of [2, 100, 1000]) {
    const markers = diffOverviewMarkers(ranges, sizes, height);
    expect(markers).toHaveLength(2);
    for (const marker of markers) {
      expect(marker.top).toBeGreaterThanOrEqual(0);
      expect(marker.height).toBeGreaterThan(0);
      expect(marker.top + marker.height).toBeLessThanOrEqual(height);
    }
    expect(markers[1].top + markers[1].height).toBeCloseTo(height);
  }
  expect(diffOverviewMarkers(ranges, sizes, 0)).toEqual([]);
  expect(diffOverviewMarkers([], [], 100)).toEqual([]);
});

it("uses displayed heights to place a change after a wrapped long line", () => {
  const rows = buildDiffRows(parseHunks(`@@ -1 +1 @@\n-${"x".repeat(150)}\n+short`), false);
  const options = { width: 200, fontSize: 12, tabSize: 4, lineNumbers: true, splitRatio: null };
  const plain = estimateDiffRowHeights(rows, { ...options, wrap: false });
  const wrapped = estimateDiffRowHeights(rows, { ...options, wrap: true });
  expect(plain).toEqual([28, 22, 22]);
  expect(wrapped[1]).toBeGreaterThan(plain[1] * 10);
  let offset = 0;
  const sizes = wrapped.map((length, index) => {
    const size = { length, index, offset };
    offset += length;
    return size;
  });
  expect(diffOverviewMarkers(diffChangeRanges(rows), sizes, 500)[1].top).toBeGreaterThan(450);
});

it("accounts for tabs, wide characters, split proportions and hidden line numbers", () => {
  const rows = buildDiffRows(parseHunks(`@@ -1 +1 @@\n-${"\t中文".repeat(30)}\n+short`), true);
  const options = {
    width: 500,
    fontSize: 14,
    tabSize: 4,
    lineNumbers: true,
    splitRatio: 0.5,
    wrap: true,
  };
  const heights = estimateDiffRowHeights(rows, options);
  expect(heights[1]).toBeGreaterThan(estimateDiffRowHeights(rows, { ...options, tabSize: 1 })[1]);
  expect(heights[1]).toBeGreaterThan(
    estimateDiffRowHeights(rows, { ...options, lineNumbers: false })[1],
  );
  expect(estimateDiffRowHeights(rows, { ...options, splitRatio: 0.2 })[1]).toBeGreaterThan(
    heights[1],
  );
  expect(estimateDiffRowHeights(rows, { ...options, width: 0 })[1]).toBeGreaterThan(0);
});
