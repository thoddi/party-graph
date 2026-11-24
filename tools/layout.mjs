// Keeps layout.json, the saved position of every card, up to date.
//
// layout.json is meant to be edited by hand: each election is one line, and each number is the
// row a party's card sits on (0 is the top row). The page keeps every saved card exactly where
// it is and only places what is missing: new parties, new elections and the rows that long
// lines pass through. So the flow is:
//
//   node tools/layout.mjs --redo        first time, or to start a tab over: a thorough search
//                                       (best of 8 runs, ~25 s per tab) writes all positions
//   (edit layout.json to taste)
//   node tools/layout.mjs               after adding data: keeps your rows, places only the new
//                                       cards (the search runs around the saved ones) and saves them
//   node tools/layout.mjs --check       lists what is missing, stale or clashing; changes nothing
//
// Options:  --redo [tab ...]   start over for the named tabs (all tabs when none are named)
//           --seeds N          searches per run (default 8)
//           --check            report only; exit code 1 when layout.json needs attention
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeElections } from '../src/services/election-data.js';
import { buildGraph } from '../src/services/graph-model.js';
import { layoutGraph } from '../src/services/layout.js';
import { DATASETS } from '../src/services/datasets.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const seedsAt = args.indexOf('--seeds');
const seeds = seedsAt >= 0 ? Number(args[seedsAt + 1]) : 8;
const check = flag('--check');
const redoAt = args.indexOf('--redo');
const redoTabs = redoAt < 0 ? [] : args.slice(redoAt + 1).filter(a => !a.startsWith('--') && Number.isNaN(Number(a)));
const redo = tab => redoAt >= 0 && (redoTabs.length === 0 || redoTabs.includes(tab));

const read = f => JSON.parse(readFileSync(join(root, f), 'utf8'));
const partiesById = Object.fromEntries(read('parties.json').map(p => [p.id, p]));
const file = join(root, 'layout.json');
const saved = existsSync(file) ? read('layout.json') : {};

const label = ({ key, id }) => `${id} (${key})`;
let needsAttention = false;
const out = {};
for (const [tab, dataFile] of Object.entries(DATASETS)) {
  const data = normalizeElections(read(dataFile));
  const graph = buildGraph(data, partiesById, tab);
  const pinned = redo(tab) ? null : saved[tab];

  if (!pinned) {
    if (check) { console.log(`${tab}: no saved layout`); needsAttention = true; continue; }
    const t0 = Date.now();
    const layout = layoutGraph(data, graph, { seeds });
    out[tab] = data.elections.map((e, i) => [e.key, layout.rows[i]]);
    console.log(`${tab}: new layout, score ${layout.cost.toFixed(1)}, ${layout.crossings} crossings, ${layout.rowCount} rows (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    continue;
  }

  const layout = layoutGraph(data, graph, { pinned, seeds: Math.min(seeds, 3) });
  const { placed, stale, clashes } = layout.report;
  console.log(`${tab}: ${layout.rowCount} rows, ${layout.crossings} crossings, score ${layout.cost.toFixed(1)}`);
  if (placed.length) console.log(`  ${check ? 'no saved row' : 'placed'}: ${placed.map(label).join(', ')}`);
  if (stale.length) console.log(`  ${check ? 'saved but not in the data' : 'dropped (not in the data)'}: ${stale.map(label).join(', ')}`);
  if (clashes.length) console.log(`  two cards on one row: ${clashes.map(c => `${label(c)} wanted row ${c.row}, taken by ${c.with}`).join('; ')}${check ? '' : ' (the second one was moved)'}`);
  if (placed.length || stale.length || clashes.length) needsAttention = true;
  out[tab] = data.elections.map((e, i) => [e.key, layout.rows[i]]);
}

if (check) process.exit(needsAttention ? 1 : 0);

// one election per line, cards in row order, so that a diff shows exactly what moved
const format = tabs => {
  const lines = Object.entries(tabs).map(([tab, elections]) => {
    const rows = elections.map(([key, cards]) => {
      const body = Object.entries(cards).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        .map(([id, row]) => `${JSON.stringify(id)}: ${row}`).join(', ');
      return `    ${JSON.stringify(key)}: { ${body} }`;
    });
    return `  ${JSON.stringify(tab)}: {\n${rows.join(',\n')}\n  }`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
};
// tabs that were not touched keep their saved rows as they are
const merged = {};
for (const tab of Object.keys(DATASETS)) {
  merged[tab] = out[tab] ?? Object.entries(saved[tab] ?? {});
}
writeFileSync(file, format(merged));
console.log('wrote layout.json');
