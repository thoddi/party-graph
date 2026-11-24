/**
 * Layout — decides where every card goes. It has no DOM code.
 *
 * Input is the graph model (see graph-model.js); the order of parties inside an election
 * in the data file does not matter. The result is the same for any order of the input.
 *
 * ## Semi-automatic
 *
 * The cards can be pinned to rows saved in layout.json (`options.pinned`, see
 * tools/layout.mjs). A pinned card never moves; the search only places what is missing:
 * new parties and elections, and the rows that long lines pass through, taking the pinned
 * cards as given. Without any pinned rows it places everything.
 *
 * ## How
 *
 * A line that skips columns gets a placeholder ("dummy") in every column it passes, so
 * it has a row of its own and never runs through a card. A group node counts as a line
 * from each of its sources to each of its targets.
 *
 * Every card and placeholder then gets a row, chosen to make this score as small as
 * possible (see COST):
 *
 *   length     every line costs its vertical distance in rows (plus a little extra for
 *              long jumps), so lines stay short and a continuing party stays level
 *   crossings  every pair of lines that cross
 *   rank       a card above the card of a bigger party in the same column (bigger by
 *              total votes in the tab), so the big parties keep a fixed order at the top
 *              (Sjálfstæðisflokkurinn, Framsókn, Alþýðuflokkurinn). A party succeeded by
 *              a bigger one takes its rank, so Íhaldsflokkurinn sits where
 *              Sjálfstæðisflokkurinn will be. Big parties are also pulled up a little.
 *   compact    every card and placeholder is pulled up a little, so there are no
 *              needless gaps
 *
 * The search starts with each column sorted by rank, then moves single cards, or a
 * party's whole level run, to other rows (swapping with what is there) by simulated
 * annealing with a fixed random seed, and ends with plain improvement passes until
 * nothing helps. Weights are in COST; tools/layout-report.mjs measures the result.
 *
 * ## Result
 *
 *   {
 *     rows:      [{ [cardId]: row }]   one object per election column
 *     edgePaths: [[{ col, row }]]      per graph.edges entry: the placeholders it passes
 *     rowCount:  number                height of the tallest column in rows
 *     crossings: number                line crossings
 *     cost:      number                the score above
 *   }
 */

// The size of a card and the gap between rows are CSS variables (--card-size, --row-gap in
// index.html) so that a phone can have smaller cards. These are the desktop values, used when
// the page has not measured anything. Row numbers do not depend on them.
export const CARD_SIZE = 120;
export const ROW_GAP = 18;

/** Distance from the top of the card grid to the middle of a row, for a measured card size and gap. */
export function rowCenter(row, size = CARD_SIZE, gap = ROW_GAP) {
  return row * (size + gap) + size / 2;
}

export const COST = {
  line: { continuation: 1, succession: 1, defection: 0.6 },    // weight of each kind of line
  bend: 3,            // a line costs 0 when level, 1 when it moves one row, then times `bend` for
                      // every further row (1, 3, 9, 27…): one 3-row step costs more than two 2-row steps
  hole: 0.15,         // an empty row inside a column (cards below it), per run of columns where it
                      // stays empty: times the run length squared, so long empty bands are expensive
  oneOff: 3,          // a party with no lines at all, above a card that has lines (same column)
  crossing: 8,
  rank: 2,            // when a card sits above a bigger party's card in the same column: times
                      // (big rank - small rank) / sqrt(big rank), so a tiny party above a mid-sized
                      // one costs nearly as much as one big party above another
  top: 0.1,           // per row, times the party's relative total vote share: big parties stay high
  compact: 0.1,       // per row
  rankPower: 1,       // rank = (total vote share relative to the biggest party) ^ rankPower
};

const MIN_ROWS = 16;      // a column may always use this many rows
const SPARE_ROWS = 2;     // rows the search may use beyond the fullest column
const RUN_MOVES = 0.5;   // share of moves that move a level run instead of one item
const ITERATIONS = 600;   // annealing moves per item
const T_START = 8;
const T_END = 0.02;

/** Small deterministic random numbers, so the same data always gives the same layout. */
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function lengthWeight(edge) {
  if (!edge.explicit) return COST.line.continuation;
  return edge.kind === 'defection' ? COST.line.defection : COST.line.succession;
}

/** Cards ("c|key|id") and placeholders ("d|tag|col"), and the links between adjacent columns. */
function prepare(data, graph) {
  const elections = data.elections;
  const columns = elections.map(() => []);
  const byId = new Map();
  const links = [];                                    // { a, b, w } with a.col + 1 === b.col

  const addItem = (col, id, extra) => {
    if (byId.has(id)) return byId.get(id);
    const item = { id, col, row: 0, links: [], ...extra };
    byId.set(id, item);
    columns[col].push(item);
    return item;
  };
  const cardId = (key, id) => `c|${key}|${id}`;

  // rank: each party's total vote share in this tab, relative to the biggest
  const total = new Map();
  for (const e of elections) for (const p of e.parties) {
    if (p && p.id) total.set(p.id, (total.get(p.id) ?? 0) + (p.votes ?? 0));
  }
  const maxTotal = Math.max(1, ...total.values());
  const rankOf = new Map([...total].map(([id, v]) => [id, Math.pow(v / maxTotal, COST.rankPower)]));

  elections.forEach((election, col) => {
    for (const party of election.parties) {
      if (party && party.id) {
        addItem(col, cardId(election.key, party.id), { card: party.id, rank: 0 });
      }
    }
  });

  const link = (a, b, w) => {
    const l = { a, b, w, n: links.length };
    links.push(l);
    a.links.push(l);
    b.links.push(l);
  };
  const chain = (from, to, w, tag) => {
    let prev = from;
    for (let col = from.col + 1; col < to.col; col++) {
      const dummy = addItem(col, `d|${tag}|${col}`, { dummy: true, rank: 0, card: null });
      link(prev, dummy, w);
      prev = dummy;
    }
    link(prev, to, w);
  };

  // a party that was succeeded by a bigger one takes its rank (Íhaldsflokkurinn sits in
  // Sjálfstæðisflokkurinn's place); only formal successions count, not defections
  const successors = graph.edges.filter(e => e.explicit && e.kind === 'succession' && e.fromId !== e.toId);
  for (let changed = true; changed;) {
    changed = false;
    for (const e of successors) {
      const r = rankOf.get(e.toId) ?? 0;
      if (r > (rankOf.get(e.fromId) ?? 0)) { rankOf.set(e.fromId, r); changed = true; }
    }
  }
  for (const item of byId.values()) item.rank = rankOf.get(item.card) ?? 0;

  const pathTags = graph.edges.map(edge => {
    const from = byId.get(cardId(edge.fromKey, edge.fromId));
    const to = byId.get(cardId(edge.toKey, edge.toId));
    if (!from || !to || from.col >= to.col) return null;
    const tag = `e${edge.fromKey}>${edge.toKey}|${edge.fromId}>${edge.toId}`;
    chain(from, to, lengthWeight(edge), tag);
    return tag;
  });

  graph.nodes.forEach(node => {
    for (const s of node.sources) {
      for (const t of node.targets) {
        const from = byId.get(cardId(s.key, s.id));
        const to = byId.get(cardId(t.key, t.id));
        if (!from || !to || from.col >= to.col) continue;
        const w = (s.kind === 'defection' || t.kind === 'defection') ? COST.line.defection : COST.line.succession;
        chain(from, to, w, `n${node.id}|${s.id}>${t.id}`);
      }
    }
  });

  // canonical order of items, independent of the order in the data files
  for (const col of columns) col.sort((a, b) => (b.rank - a.rank) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const gaps = elections.map(() => []);                 // links leaving each column
  for (const l of links) gaps[l.a.col].push(l);

  return { columns, links, gaps, byId, pathTags };
}

const linkLength = l => {
  const d = Math.abs(l.a.row - l.b.row);
  return d === 0 ? 0 : l.w * Math.pow(COST.bend, d - 1);
};
const itemCost = item => (COST.compact + COST.top * item.rank) * item.row;
/** Penalty between two cards of one column: one-off parties and smaller parties should be below. */
const rankCost = (x, y) => {
  const xOne = x.links.length === 0, yOne = y.links.length === 0;
  if (xOne !== yOne) {
    // a one-off party (no lines) belongs below every party that has lines
    const [one, other] = xOne ? [x, y] : [y, x];
    return one.row < other.row ? COST.oneOff : 0;
  }
  if (x.rank === y.rank) return 0;
  const [big, small] = x.rank > y.rank ? [x, y] : [y, x];
  return big.row > small.row ? COST.rank * (big.rank - small.rank) / Math.sqrt(big.rank) : 0;
};
/**
 * Cost of the empty rows ("holes": empty, with something below in the same column) in
 * runs that touch the given columns. Each run is counted once.
 */
function holeCost(occ, cols) {
  const bottom = new Map();
  const lowest = c => {
    if (!bottom.has(c)) {
      let b = -1;
      for (let r = occ[c].length - 1; r >= 0; r--) if (occ[c][r]) { b = r; break; }
      bottom.set(c, b);
    }
    return bottom.get(c);
  };
  const isHole = (c, r) => c >= 0 && c < occ.length && !occ[c][r] && r < lowest(c);
  const seen = new Set();
  let cost = 0;
  for (const c of cols) {
    for (let r = 0; r < occ[c].length; r++) {
      if (!isHole(c, r)) continue;
      let a = c, b = c;
      while (isHole(a - 1, r)) a--;
      while (isHole(b + 1, r)) b++;
      const key = r * 10000 + a;
      if (seen.has(key)) continue;
      seen.add(key);
      const len = b - a + 1;
      cost += COST.hole * len * len;
    }
  }
  return cost;
}

const crosses = (l, m) => (l.a.row - m.a.row) * (l.b.row - m.b.row) < 0;

/** Score of everything that involves the given items (each line, crossing and rank pair counted once). */
function localCost(items, gaps, columnCards) {
  let cost = 0;
  const set = new Set(items);
  const mine = new Set();
  for (const item of items) {
    cost += itemCost(item);
    for (const l of item.links) mine.add(l);
    if (item.dummy) continue;
    for (const other of columnCards[item.col]) {
      if (other === item || (set.has(other) && other.id < item.id)) continue;
      cost += rankCost(item, other);
    }
  }
  for (const l of mine) {
    cost += linkLength(l);
    for (const m of gaps[l.a.col]) {
      if (m === l || (mine.has(m) && m.n < l.n)) continue;
      if (crosses(l, m)) cost += COST.crossing;
    }
  }
  return cost;
}

function totalCost(items, links, gaps) {
  let cost = 0, crossings = 0;
  const parts = { length: 0, crossing: 0, rank: 0, compact: 0 };
  for (const item of items) {
    cost += itemCost(item);
    parts.rank += COST.top * item.rank * item.row;
    parts.compact += COST.compact * item.row;
  }
  const byCol = new Map();
  for (const item of items) if (!item.dummy) { if (!byCol.has(item.col)) byCol.set(item.col, []); byCol.get(item.col).push(item); }
  for (const col of byCol.values()) {
    for (let i = 0; i < col.length; i++) for (let j = i + 1; j < col.length; j++) {
      const r = rankCost(col[i], col[j]);
      cost += r; parts.rank += r;
    }
  }
  for (const l of links) { cost += linkLength(l); parts.length += linkLength(l); }
  for (const list of gaps) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) if (crosses(list[i], list[j])) crossings++;
    }
  }
  parts.crossing = crossings * COST.crossing;
  const height = Math.max(0, ...items.map(i => i.row)) + 1;
  const occ = gaps.map(() => new Array(height).fill(null));
  for (const item of items) occ[item.col][item.row] = item;
  parts.hole = holeCost(occ, occ.map((_, c) => c));
  return { cost: cost + crossings * COST.crossing + parts.hole, crossings, parts };
}

/**
 * The level run through `item`: the items joined to it, column after column, by
 * horizontal lines. Moving a whole run keeps a party's lane straight.
 */
function levelRun(item) {
  const run = [item];
  for (let cur = item; ;) {
    const l = cur.links.find(l => l.b === cur && l.a.row === cur.row);
    if (!l) break;
    run.unshift(l.a); cur = l.a;
  }
  for (let cur = item; ;) {
    const l = cur.links.find(l => l.a === cur && l.b.row === cur.row);
    if (!l) break;
    run.push(l.b); cur = l.b;
  }
  return run;
}

/**
 * Move every item of `run` (all on one row, each in its own column) to `row`, swapping
 * with whatever is there. Moving back to the old row undoes it. Returns the change in score.
 */
function moveRun(run, row, occ, gaps, columnCards) {
  const affected = [...run];
  for (const item of run) { const o = occ[item.col][row]; if (o) affected.push(o); }
  const cols = [...new Set(run.map(item => item.col))];
  const before = localCost(affected, gaps, columnCards) + holeCost(occ, cols);
  for (const item of run) {
    const col = occ[item.col];
    const from = item.row;
    const other = col[row];
    col[from] = other ?? null;
    if (other) other.row = from;
    col[row] = item;
    item.row = row;
  }
  return localCost(affected, gaps, columnCards) + holeCost(occ, cols) - before;
}

function optimise(columns, links, gaps, height, options = {}) {
  const items = columns.flat();
  const occ = columns.map(col => {
    const rows = new Array(height).fill(null);
    col.forEach((item, i) => { item.row = i; rows[i] = item; });
    return rows;
  });
  if (options.start) placeStart(columns, occ, options.start, height);
  if (options.pinned) placePinned(columns, occ, options.pinned, height);
  const free = items.filter(item => !item.fixed);
  const columnCards = columns.map(col => col.filter(item => !item.dummy));
  // a run or a move may not touch a pinned card, nor swap places with one
  const movable = (run, row) => run.every(item => !item.fixed && !occ[item.col][row]?.fixed);
  const move = (run, row) => movable(run, row) ? moveRun(run, row, occ, gaps, columnCards) : Infinity;

  const rnd = seeded(options.seed ?? 1);
  const T0 = options.tStart ?? T_START, T1 = options.tEnd ?? T_END;
  const steps = options.anneal === false || !free.length ? 0 : (options.iterations ?? ITERATIONS) * free.length;
  const cool = Math.pow(T1 / T0, 1 / Math.max(1, steps));
  let t = T0;
  for (let s = 0; s < steps; s++, t *= cool) {
    const item = free[Math.floor(rnd() * free.length)];
    let run = [item];
    if (rnd() < RUN_MOVES) {
      // the whole level run, or a random piece of it that contains the item
      run = levelRun(item);
      if (run.length > 1 && rnd() < 0.5) {
        const i = run.indexOf(item);
        run = run.slice(Math.floor(rnd() * (i + 1)), i + 1 + Math.floor(rnd() * (run.length - i)));
      }
    }
    // mostly small moves; sometimes anywhere in the column
    const row = rnd() < 0.7
      ? item.row + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3))
      : Math.floor(rnd() * height);
    if (row < 0 || row >= height || row === item.row) continue;
    const from = item.row;
    const delta = move(run, row);
    if (delta === Infinity) continue;
    if (delta > 0 && rnd() >= Math.exp(-delta / t)) move(run, from);   // undo
  }

  // improvement passes: try every row for every item and its level run, keep what helps
  let improved = options.improve !== false;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (const item of free) {
      for (const whole of [false, true]) {
        const run = whole ? levelRun(item) : [item];
        if (whole && run.length === 1) continue;
        for (let row = 0; row < height; row++) {
          if (row === item.row) continue;
          const from = item.row;
          const delta = move(run, row);
          if (delta === Infinity) continue;
          if (delta < -1e-9) improved = true;
          else move(run, from);
        }
      }
    }
  }

  // drop rows that are empty in every column (never with pinned rows: they must stay where they are)
  if (options.pinned) return Math.max(0, ...items.map(item => item.row)) + 1;
  const used = new Array(height).fill(false);
  for (const item of items) used[item.row] = true;
  const shift = [];
  let next = 0;
  for (let r = 0; r < height; r++) { shift[r] = next; if (used[r]) next++; }
  for (const item of items) item.row = shift[item.row];
  return next;
}

/**
 * Put every card that has a row in `pinned` (`pinned[col][cardId]`) on that row and mark it
 * fixed. Everything else (new cards, and the placeholders of long lines) goes to the free
 * row nearest the average row of its neighbours that are already placed; the search then
 * only moves these.
 */
function placePinned(columns, occ, pinned, height) {
  for (const rows of occ) rows.fill(null);
  const placed = new Set();
  columns.forEach((col, c) => col.forEach(item => {
    const row = item.dummy ? undefined : pinned[c]?.[item.card];
    if (Number.isInteger(row) && row >= 0 && row < height && !occ[c][row]) {
      item.row = row; item.fixed = true; occ[c][row] = item; placed.add(item);
    }
  }));
  columns.forEach((col, c) => col.forEach((item, i) => {
    if (item.fixed) return;
    const near = item.links.map(l => (l.a === item ? l.b : l.a)).filter(o => placed.has(o));
    const want = near.length ? near.reduce((sum, o) => sum + o.row, 0) / near.length : i;
    let best = -1;
    for (let r = 0; r < height; r++) if (!occ[c][r] && (best < 0 || Math.abs(r - want) < Math.abs(best - want))) best = r;
    item.row = best; occ[c][best] = item; placed.add(item);
  }));
}

/**
 * Start from given card rows (`start[col][cardId]`, e.g. a hand-made layout). Placeholders
 * go to the free row nearest the straight line between the cards they connect.
 */
function placeStart(columns, occ, start, height) {
  for (const rows of occ) rows.fill(null);
  columns.forEach((col, c) => col.forEach(item => {
    if (!item.dummy) { item.row = start[c][item.card]; occ[c][item.row] = item; }
  }));
  const ends = item => {
    let a = item, b = item;
    while (a.dummy) a = a.links.find(l => l.b === a).a;
    while (b.dummy) b = b.links.find(l => l.a === b).b;
    return [a, b];
  };
  columns.forEach((col, c) => col.forEach(item => {
    if (!item.dummy) return;
    const [a, b] = ends(item);
    const want = a.row + (b.row - a.row) * (c - a.col) / (b.col - a.col);
    let best = -1;
    for (let r = 0; r < height; r++) if (!occ[c][r] && (best < 0 || Math.abs(r - want) < Math.abs(best - want))) best = r;
    item.row = best; occ[c][best] = item;
  }));
}

/**
 * @param {{elections: object[]}} data  normalised election data for one tab
 * @param {object} graph                from buildGraph()
 * @param {object} [options]            pinned: saved rows `{ [electionKey]: { [partyId]: row } }`, kept as they are;
 *                                      seeds: number of searches to run (best wins); start: card rows
 *                                      to start from; anneal / improve: false to skip a stage
 */
export function layoutGraph(data, graph, options = {}) {
  // several independent searches (seeds 1..n); the lowest score wins
  const seeds = options.seeds ?? 1;
  let best = null;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = layoutOnce(data, graph, { ...options, seed: options.seed ?? seed });
    if (!best || result.cost < best.cost) best = result;
  }
  return best;
}

function layoutOnce(data, graph, options) {
  const { columns, links, gaps, byId, pathTags } = prepare(data, graph);
  const maxCount = Math.max(0, ...columns.map(c => c.length));
  let height = Math.max(MIN_ROWS, maxCount + SPARE_ROWS);
  const pinned = options.pinned ? data.elections.map(e => options.pinned[e.key] ?? {}) : null;
  if (pinned) {
    for (const col of pinned) for (const row of Object.values(col)) if (Number.isInteger(row)) height = Math.max(height, row + 1 + SPARE_ROWS);
  }
  const rowCount = optimise(columns, links, gaps, height, { ...options, pinned });

  const rows = data.elections.map(() => ({}));
  for (const item of byId.values()) if (!item.dummy) rows[item.col][item.card] = item.row;

  const edgePaths = pathTags.map(tag => {
    const path = [];
    if (!tag) return path;
    for (let col = 0; col < data.elections.length; col++) {
      const d = byId.get(`d|${tag}|${col}`);
      if (d) path.push({ col, row: d.row });
    }
    return path;
  });

  const { cost, crossings, parts } = totalCost([...byId.values()], links, gaps);
  return { rows, edgePaths, rowCount, crossings, cost, parts, report: pinned ? pinReport(data, byId, options.pinned) : null };
}

/**
 * What did not fit the saved rows: cards with no saved row (`placed`, put there by the
 * search), saved rows of cards that are not in the data any more (`stale`), and two cards
 * saved on the same row (`clashes`; the second was treated as new).
 */
function pinReport(data, byId, pinned) {
  const placed = [], stale = [], clashes = [];
  data.elections.forEach((e, c) => {
    const saved = pinned[e.key] ?? {};
    const taken = new Map();
    for (const party of e.parties) {
      if (!party || !party.id) continue;
      const row = saved[party.id];
      const item = byId.get(`c|${e.key}|${party.id}`);
      if (!Number.isInteger(row)) { placed.push({ key: e.key, id: party.id }); continue; }
      if (item && item.row !== row) clashes.push({ key: e.key, id: party.id, row, with: taken.get(row) });
      else taken.set(row, party.id);
    }
    for (const id of Object.keys(saved)) {
      if (!e.parties.some(p => p && p.id === id)) stale.push({ key: e.key, id });
    }
  });
  for (const key of Object.keys(pinned)) {
    if (!data.elections.some(e => e.key === key)) stale.push({ key, id: '*' });
  }
  return { placed, stale, clashes };
}
