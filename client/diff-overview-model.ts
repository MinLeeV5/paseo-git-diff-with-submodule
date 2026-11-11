import type { DiffRow } from "./diff-model";

export type DiffChangeRange = {
  kind: "added" | "removed";
  start: number;
  end: number;
  firstLine: number;
  lastLine: number;
  hunk: number;
};

// Keep additions and deletions in separate lanes, including paired split rows.
export function diffChangeRanges(rows: DiffRow[]): DiffChangeRange[] {
  const ranges: DiffChangeRange[] = [];
  const previous: Partial<Record<DiffChangeRange["kind"], DiffChangeRange>> = {};
  let hunk = -1;
  rows.forEach((row, index) => {
    if ("header" in row) {
      hunk++;
      return;
    }
    for (const kind of ["removed", "added"] as const) {
      const line = [row.left, row.right].find((line) => line?.kind === kind);
      if (!line) continue;
      const number = (kind === "added" ? line.newLine : line.oldLine) ?? 0;
      const range = previous[kind];
      if (range && range.end === index - 1 && range.hunk === hunk) {
        range.end = index;
        range.lastLine = number;
      } else {
        const range = { kind, start: index, end: index, firstLine: number, lastLine: number, hunk };
        ranges.push(range);
        previous[kind] = range;
      }
    }
  });
  return ranges;
}

export function estimateDiffRowHeights(
  rows: DiffRow[],
  options: {
    wrap: boolean;
    width: number;
    fontSize: number;
    tabSize: number;
    lineNumbers: boolean;
    gutterWidth?: number;
    splitRatio: number | null;
  },
): number[] {
  const { wrap, width, fontSize, tabSize, lineNumbers, splitRatio, gutterWidth = 40 } = options;
  function lines(content: string, available: number) {
    let columns = 0;
    for (const character of content)
      columns += character === "\t" ? tabSize : (character.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
    return Math.max(1, Math.ceil((columns * fontSize * 0.65) / Math.max(fontSize, available)));
  }
  return rows.map((row) => {
    if ("header" in row) return 28;
    if (!wrap) return fontSize + 10;
    const count =
      splitRatio === null
        ? lines(row.left?.content ?? "", width - (lineNumbers ? gutterWidth * 2 : 0) - 33)
        : Math.max(
            lines(
              row.left?.content ?? "",
              width * splitRatio - (lineNumbers ? gutterWidth : 0) - 33,
            ),
            lines(
              row.right?.content ?? "",
              width * (1 - splitRatio) - (lineNumbers ? gutterWidth : 0) - 33,
            ),
          );
    return count * (fontSize + 6) + 4;
  });
}

export type DiffRowLayout = { index: number; length: number; offset: number };

export function diffOverviewMarkers(
  ranges: DiffChangeRange[],
  sizes: DiffRowLayout[],
  height: number,
): (DiffChangeRange & { top: number; height: number })[] {
  const last = sizes.at(-1);
  const total = last ? last.offset + last.length : 0;
  if (height <= 0 || total <= 0) return [];
  return ranges.map((range) => {
    const first = sizes[range.start];
    const last = sizes[range.end];
    const size = Math.min(
      height,
      Math.max(4, ((last.offset + last.length - first.offset) / total) * height),
    );
    return {
      ...range,
      top: Math.min(height - size, (first.offset / total) * height),
      height: size,
    };
  });
}
