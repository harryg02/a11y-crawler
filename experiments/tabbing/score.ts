import fs from 'node:fs';
import path from 'node:path';

const HERE = __dirname;

export interface Truth {
  pages: Record<string, string[]>;
  probes: Record<string, { label: 'violation' | 'ok' | 'decoy' | 'excluded'; note: string }>;
}

export function loadTruth(): Truth {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/truth.json'), 'utf8'));
}

export interface Score {
  detector: string;
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number; f1: number;
  falsePositives: string[];
  falseNegatives: string[];
  ms?: number;
}

/**
 * Scores a detector's reported violation set against ground truth, over the
 * probe universe it was given the chance to see. `universe` is every labelled
 * probe on the pages the detector actually ran on — so a detector is never
 * penalised for a page it was not shown.
 */
export function score(detector: string, reported: Iterable<string>, universe: string[], truth: Truth, ms?: number): Score {
  const hit = new Set(reported);
  const positives = universe.filter(p => truth.probes[p]?.label === 'violation');
  const negatives = universe.filter(p => truth.probes[p] && truth.probes[p].label !== 'violation');

  const tp = positives.filter(p => hit.has(p));
  const fn = positives.filter(p => !hit.has(p));
  const fp = negatives.filter(p => hit.has(p));
  const tn = negatives.filter(p => !hit.has(p));

  const precision = tp.length + fp.length === 0 ? 0 : tp.length / (tp.length + fp.length);
  const recall = positives.length === 0 ? 0 : tp.length / positives.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    detector,
    tp: tp.length, fp: fp.length, fn: fn.length, tn: tn.length,
    precision, recall, f1,
    falsePositives: fp, falseNegatives: fn, ms,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function scoreTable(scores: Score[]): string {
  const rows = scores.map(s => `| ${s.detector} | ${s.tp} | ${s.fp} | ${s.fn} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} | ${s.ms == null ? '—' : s.ms < 1000 ? s.ms + 'ms' : (s.ms / 1000).toFixed(1) + 's'} |`);
  return [
    '| detector | TP | FP | FN | precision | recall | F1 | runtime |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export function writeResults(name: string, data: unknown): string {
  const dir = path.join(HERE, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return file;
}
