import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const metrics = [
  "firstListMs",
  "completeListMs",
  "firstFileMs",
  "allFilesMs",
  "cachedFileMs",
  "expiredCachedFileMs",
  "busyFileMs",
  "refreshMs",
  "firstBytes",
  "totalBytes",
  "refreshBytes",
] as const;
type Metric = (typeof metrics)[number];
type Sample = Record<Metric, number> & {
  scenario: string;
  variant: "baseline" | "candidate";
  round: number;
  digest: string;
};
interface Report {
  candidateSourceHash: string;
  baselineCommit: string;
  samples: Sample[];
}
const paths = process.argv.slice(2).map((path) => resolve(path));
assert.equal(new Set(paths).size, paths.length, "Do not include a report twice");
assert(paths.length > 0, "Pass results.json paths; every supplied sample is included in the gate");
const reports = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as Report),
);
for (const report of reports) {
  assert.equal(
    report.candidateSourceHash,
    reports[0].candidateSourceHash,
    "Candidate sources differ",
  );
  assert.equal(report.baselineCommit, reports[0].baselineCommit, "Baseline sources differ");
  assert(
    report.samples.every((sample) => sample.round >= 0),
    "Exclude warmups before recording formal samples",
  );
}
const samples = reports.flatMap((report) => report.samples);
assert(samples.length > 0, "No formal samples supplied");
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const scenarios = [...new Set(samples.map((sample) => sample.scenario))];
const gates = scenarios.map((scenario) => {
  const before = samples.filter(
    (sample) => sample.scenario === scenario && sample.variant === "baseline",
  );
  const after = samples.filter(
    (sample) => sample.scenario === scenario && sample.variant === "candidate",
  );
  assert(
    before.length >= 7 && before.length === after.length,
    "Need at least seven balanced formal pairs",
  );
  assert.equal(
    new Set([...before, ...after].map((sample) => sample.digest)).size,
    1,
    "Diff contents differ",
  );
  return {
    scenario,
    pairs: before.length,
    metrics: Object.fromEntries(
      metrics.map((metric) => {
        assert(
          [...before, ...after].every((sample) => Number.isFinite(sample[metric])),
          `Invalid ${metric}`,
        );
        const baseline = median(before.map((sample) => sample[metric]));
        const candidate = median(after.map((sample) => sample[metric]));
        const tolerance = metric === "cachedFileMs" ? 0.5 : metric.endsWith("Bytes") ? 0 : 5;
        return [
          metric,
          {
            before: baseline,
            after: candidate,
            difference: candidate - baseline,
            ratio: candidate / baseline,
            tolerance,
            passed: candidate <= baseline + tolerance,
          },
        ];
      }),
    ),
  };
});
const failed = gates.flatMap((gate) =>
  Object.entries(gate.metrics)
    .filter(([, value]) => !value.passed)
    .map(([metric, value]) => ({ scenario: gate.scenario, pairs: gate.pairs, metric, ...value })),
);
const output = resolve(
  process.env.PASEO_GATE_OUTPUT ?? "artifacts/performance-optimization/gate.json",
);
const result = {
  checkedAt: new Date().toISOString(),
  candidateSourceHash: reports[0].candidateSourceHash,
  baselineCommit: reports[0].baselineCommit,
  inputs: paths.map((path, index) => ({ path, samples: reports[index].samples.length })),
  samples: samples.length,
  passed: failed.length === 0,
  gates,
  failed,
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify({ passed: result.passed, samples: result.samples, failed, output }, null, 2),
);
if (!result.passed) process.exitCode = 1;
