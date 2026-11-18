// Works out the layout of every tab with a thorough search and saves it to layout.json.
// Run it after changing the election data or parties.json:
//
//   node tools/layout.mjs [seeds]        (default 8 searches per tab; the best one is kept)
//
// The page uses the saved layout only while it still matches the data (see
// layoutFingerprint in src/services/layout.js); otherwise it works one out itself, with a
// quicker search.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeElections } from '../src/services/election-data.js';
import { buildGraph } from '../src/services/graph-model.js';
import { layoutGraph, layoutFingerprint } from '../src/services/layout.js';
import { DATASETS } from '../src/services/datasets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seeds = Number(process.argv[2] ?? 8);
const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));
const partiesById = Object.fromEntries(read('parties.json').map(p => [p.id, p]));

const out = {};
for (const [tab, file] of Object.entries(DATASETS)) {
  const data = normalizeElections(read(file));
  const graph = buildGraph(data, partiesById, tab);
  const t0 = Date.now();
  const layout = layoutGraph(data, graph, { seeds });
  out[tab] = {
    fingerprint: layoutFingerprint(data, graph),
    rowCount: layout.rowCount,
    rows: Object.fromEntries(data.elections.map((e, i) => [e.key, layout.rows[i]])),
    // per line ("fromKey|fromId|toKey|toId") that skips columns: [column key, row] it passes
    edgePaths: Object.fromEntries(graph.edges
      .map((e, i) => [`${e.fromKey}|${e.fromId}|${e.toKey}|${e.toId}`, layout.edgePaths[i].map(({ col, row }) => [data.elections[col].key, row])])
      .filter(([, path]) => path.length)),
  };
  console.log(`${tab}: score ${layout.cost.toFixed(1)}, ${layout.crossings} crossings, ${layout.rowCount} rows (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
writeFileSync(join(root, 'layout.json'), JSON.stringify(out) + '\n');
console.log('wrote layout.json');
