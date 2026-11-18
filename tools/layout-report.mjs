// Measures a layout. Usage:
//   node tools/layout-report.mjs [dir]        dir holds parties.json, data.json, borgarstjorn_data.json
//                                            (default: the repository root)
//   node tools/layout-report.mjs --shuffle    also checks that the automatic layout does not depend on
//                                            the order of the parties inside an election
// A data file that still has `{}` spacers is measured as drawn by hand (row = index in the file);
// otherwise it is measured with services/layout.js.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeElections } from '../src/services/election-data.js';
import { buildGraph } from '../src/services/graph-model.js';
import { layoutGraph } from '../src/services/layout.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const shuffle = args.includes('--shuffle');
const dir = args.find(a => !a.startsWith('--')) ?? root;
const read = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const partiesById = Object.fromEntries(read('parties.json').map(p => [p.id, p]));

function seeded(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

function shuffled(data, seed) {
  const rnd = seeded(seed);
  const copy = JSON.parse(JSON.stringify(data));
  for (const e of copy.elections) {
    for (let i = e.parties.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [e.parties[i], e.parties[j]] = [e.parties[j], e.parties[i]];
    }
  }
  return copy;
}

/** Straight pieces between adjacent columns: [col, y at col, y at col + 1]. */
function pieces(data, graph, rowOf, pathOf) {
  const colOf = new Map(data.elections.map((e, i) => [e.key, i]));
  const out = [];
  const add = (a, ya, b, yb, path) => {
    const pts = [{ col: a, y: ya }, ...(path ?? []).map(p => ({ col: p.col, y: p.row })), { col: b, y: yb }];
    if (!path) for (let c = a + 1; c < b; c++) pts.splice(c - a, 0, { col: c, y: ya + (yb - ya) * (c - a) / (b - a) });
    for (let i = 0; i + 1 < pts.length; i++) out.push({ col: pts[i].col, a: pts[i].y, b: pts[i + 1].y, through: i > 0 || false });
    return pts;
  };
  const longLines = [];
  graph.edges.forEach((edge, i) => {
    const a = colOf.get(edge.fromKey), b = colOf.get(edge.toKey);
    const ya = rowOf(a, edge.fromId), yb = rowOf(b, edge.toId);
    if (ya == null || yb == null) return;
    longLines.push(add(a, ya, b, yb, pathOf(i)));
  });
  graph.nodes.forEach(node => {
    for (const s of node.sources) for (const t of node.targets) {
      const a = colOf.get(s.key), b = colOf.get(t.key);
      const ya = rowOf(a, s.id), yb = rowOf(b, t.id);
      if (ya != null && yb != null) add(a, ya, b, yb);
    }
  });
  return { out, longLines };
}

function measure(name, data, graph, rowOf, pathOf, height) {
  const { out, longLines } = pieces(data, graph, rowOf, pathOf);
  let crossings = 0, length = 0;
  for (let i = 0; i < out.length; i++) {
    length += Math.abs(out[i].a - out[i].b);
    for (let j = i + 1; j < out.length; j++) {
      if (out[i].col !== out[j].col) continue;
      if ((out[i].a - out[j].a) * (out[i].b - out[j].b) < 0) crossings++;
    }
  }
  // a line is "through a card" when, in a column it passes, it is within a card's height of that card
  let hits = 0;
  for (const pts of longLines) {
    for (const p of pts.slice(1, -1)) {
      const cards = data.elections[p.col].parties.filter(x => x && x.id).map(x => rowOf(p.col, x.id));
      if (cards.some(r => Math.abs(r - p.y) < 0.45)) hits++;
    }
  }
  console.log(`${name.padEnd(14)} crossings ${String(crossings).padStart(4)}   length ${String(Math.round(length)).padStart(4)}   through-card ${String(hits).padStart(3)}   rows ${height}`);
  return { crossings, length, hits, height };
}

let failed = false;
for (const [tab, file] of [['althingi', 'data.json'], ['borgarstjorn', 'borgarstjorn_data.json']]) {
  const data = normalizeElections(read(file));
  const graph = buildGraph(data, partiesById, tab);
  const hand = data.elections.some(e => e.parties.some(p => !p || !p.id));
  if (hand) {
    const rowOf = (col, id) => { const i = data.elections[col].parties.findIndex(p => p && p.id === id); return i < 0 ? null : i; };
    measure(`${tab} (hand)`, data, graph, rowOf, () => undefined, Math.max(...data.elections.map(e => e.parties.length)));
    continue;
  }
  const layout = layoutGraph(data, graph);
  measure(`${tab} (auto)`, data, graph, (col, id) => layout.rows[col][id] ?? null, i => layout.edgePaths[i].length ? layout.edgePaths[i] : undefined, layout.rowCount);
  if (shuffle) {
    for (const seed of [1, 2, 3]) {
      const d2 = normalizeElections(shuffled(read(file), seed));
      const l2 = layoutGraph(d2, buildGraph(d2, partiesById, tab));
      const norm = rows => JSON.stringify(rows.map(r => Object.fromEntries(Object.entries(r).sort())));
      const same = norm(l2.rows) === norm(layout.rows);
      console.log(`  shuffle ${seed}: ${same ? 'same layout' : 'DIFFERENT layout'}`);
      if (!same) failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
