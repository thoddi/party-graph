/**
 * Layout — decides where every card goes. It has no DOM code.
 *
 * Input is the graph model (see graph-model.js); the order of parties inside an election
 * in the data file does not matter. The result is the same for any order of the input.
 *
 * ## Stages
 *
 *   1. Prepare. A line that skips columns gets a placeholder ("dummy") in every column it
 *      passes, so that it gets a row of its own instead of crossing a card. A group node
 *      counts as a link from each of its sources to each of its targets.
 *   2. Order. Cards start sorted by vote share (then id). Then the columns are swept
 *      back and forth, each one sorted by the average position of the items it is linked
 *      to in the neighbouring column (barycenter). Adjacent items are swapped when that
 *      removes crossings. The order with the fewest crossings wins.
 *   3. Rows. The order inside a column stays fixed, but there may be empty rows between
 *      items, so a party that continues keeps its line level. Links of a continuing
 *      party count more than a succession, and a succession more than a defection.
 *
 * ## Result
 *
 *   {
 *     rows:      [{ [cardId]: row }]   one object per election column
 *     edgePaths: [[{ col, row }]]      per graph.edges entry: the placeholders it passes
 *     rowCount:  number                height of the tallest column in rows
 *     crossings: number                line crossings in the chosen order
 *   }
 */

export const CARD_SIZE = 120;
export const ROW_GAP = 18;
export const ROW_PITCH = CARD_SIZE + ROW_GAP;

const MIN_ROWS = 16;      // a column may always use this many rows
const SWEEPS = 24;        // most barycenter passes per start (a pass is one sweep down and one up)
const RESTARTS = 400;      // starting orders tried; the first is the canonical one
const ROW_PASSES = 30;

const WEIGHT = { continuation: 3, succession: 2, defection: 1 };

/** Weight of a link: a party continuing counts most. */
function weightOf(edge) {
  if (!edge.explicit) return WEIGHT.continuation;
  return edge.kind === 'defection' ? WEIGHT.defection : WEIGHT.succession;
}

/**
 * Items are the things that take a row: cards ("c|key|id") and placeholders ("d|edge|col").
 * Returns the items of each column, and the links between items in adjacent columns.
 */
function prepare(data, graph) {
  const elections = data.elections;
  const colOf = new Map(elections.map((e, i) => [e.key, i]));
  const columns = elections.map(() => []);                 // items per column
  const byId = new Map();
  const links = [];                                        // { a, b, w } with col(a) + 1 === col(b)
  const edgePaths = graph.edges.map(() => []);

  const addItem = (col, id, extra) => {
    if (byId.has(id)) return byId.get(id);
    const item = { id, col, ...extra };
    byId.set(id, item);
    columns[col].push(item);
    return item;
  };
  const cardId = (key, id) => `c|${key}|${id}`;

  elections.forEach((election, col) => {
    for (const party of election.parties) {
      if (party && party.id) addItem(col, cardId(election.key, party.id), { card: party.id, votes: party.votes ?? 0 });
    }
  });

  const chain = (fromItem, toItem, weight, tag) => {
    let prev = fromItem;
    for (let col = fromItem.col + 1; col < toItem.col; col++) {
      const dummy = addItem(col, `d|${tag}|${col}`, { dummy: true, tag });
      links.push({ a: prev, b: dummy, w: weight });
      prev = dummy;
    }
    links.push({ a: prev, b: toItem, w: weight });
  };

  graph.edges.forEach((edge, i) => {
    const from = byId.get(cardId(edge.fromKey, edge.fromId));
    const to = byId.get(cardId(edge.toKey, edge.toId));
    if (!from || !to || from.col >= to.col) return;
    chain(from, to, weightOf(edge), `e${edge.fromKey}>${edge.toKey}|${edge.fromId}>${edge.toId}`);
    edge.pathTag = `e${edge.fromKey}>${edge.toKey}|${edge.fromId}>${edge.toId}`;
  });

  graph.nodes.forEach(node => {
    for (const s of node.sources) {
      for (const t of node.targets) {
        const from = byId.get(cardId(s.key, s.id));
        const to = byId.get(cardId(t.key, t.id));
        if (!from || !to || from.col >= to.col) continue;
        const w = (s.kind === 'defection' || t.kind === 'defection') ? WEIGHT.defection : WEIGHT.succession;
        chain(from, to, w, `n${node.id}|${s.id}>${t.id}`);
      }
    }
  });

  return { columns, links, byId, colOf, edgePaths, elections };
}

/** Crossings between links of every pair of adjacent columns, given the position of each item. */
function countCrossings(links, pos) {
  let total = 0;
  const byCol = new Map();
  for (const l of links) {
    const c = l.a.col;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push(l);
  }
  for (const list of byCol.values()) total += crossingsBetween(list, pos);
  return total;
}

function crossingsBetween(list, pos) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const pa = pos.get(list[i].a), pb = pos.get(list[i].b);
    for (let j = i + 1; j < list.length; j++) {
      const qa = pos.get(list[j].a), qb = pos.get(list[j].b);
      if ((pa - qa) * (pb - qb) < 0) n++;
    }
  }
  return n;
}

function positions(columns) {
  const pos = new Map();
  columns.forEach(col => col.forEach((item, i) => pos.set(item, i)));
  return pos;
}

function compareItems(a, b) {
  if (a.dummy !== b.dummy) return a.dummy ? 1 : -1;            // cards first
  if (!a.dummy && a.votes !== b.votes) return b.votes - a.votes;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function initialOrder(columns) {
  return columns.map(col => [...col].sort(compareItems));
}

/** Sort one column by the average position of its neighbours in column `from`. Keeps `pos` up to date. */
function sortByNeighbours(order, col, from, neighbours, pos) {
  const keyed = order[col].map((item, i) => {
    const ns = neighbours.get(item)?.filter(n => n.col === from) ?? [];
    const key = ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : i;
    return { item, key, i };
  });
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  order[col] = keyed.map(k => k.item);
  order[col].forEach((item, i) => pos.set(item, i));
}

/** Swap adjacent items while that reduces crossings. `pos` is kept up to date. */
function transpose(order, incident, pos) {
  let improved = true;
  let rounds = 0;
  while (improved && rounds++ < 20) {
    improved = false;
    for (let col = 0; col < order.length; col++) {
      for (let i = 0; i + 1 < order[col].length; i++) {
        const a = order[col][i], b = order[col][i + 1];
        // only links of the two swapped items can change status
        const touching = [...(incident.get(a) ?? []), ...(incident.get(b) ?? [])];
        if (!touching.length) continue;
        const before = crossingsBetween(touching, pos);
        pos.set(a, i + 1); pos.set(b, i);
        if (crossingsBetween(touching, pos) < before) {
          order[col][i] = b; order[col][i + 1] = a;
          improved = true;
        } else {
          pos.set(a, i); pos.set(b, i + 1);
        }
      }
    }
  }
}

/** Small deterministic random numbers, so the same data always gives the same layout. */
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function orderColumns(columns, links) {
  const up = new Map(), down = new Map();          // neighbours to the left / right
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const incident = new Map();
  for (const l of links) {
    add(up, l.b, l.a);
    add(down, l.a, l.b);
    add(incident, l.a, l);
    add(incident, l.b, l);
  }

  const start = initialOrder(columns);
  let best = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < RESTARTS; attempt++) {
    // attempt 0 starts from the canonical order, the others from a shuffled copy of it
    const rnd = seeded(attempt + 1);
    const order = start.map(col => {
      const copy = [...col];
      if (attempt > 0) for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    });
    let score = Infinity, stale = 0;
    for (let pass = 0; pass < SWEEPS && stale < 3; pass++) {
      const pos = positions(order);
      for (let col = 1; col < order.length; col++) sortByNeighbours(order, col, col - 1, up, pos);
      for (let col = order.length - 2; col >= 0; col--) sortByNeighbours(order, col, col + 1, down, pos);
      transpose(order, incident, pos);
      const now = countCrossings(links, pos);
      if (now < score) { score = now; stale = 0; } else stale++;
      if (now < bestScore) { bestScore = now; best = order.map(c => [...c]); }
    }
  }
  return { order: best, crossings: bestScore };
}

/**
 * Gives every item a row. Items keep their order; rows may skip numbers. Each item is
 * pulled towards the weighted average row of the items it is linked to, then the rows
 * are made strictly increasing again (pool-adjacent-violators on `row - index`).
 */
function assignRows(order, links, cap) {
  const nbrs = new Map();
  for (const l of links) {
    for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) {
      if (!nbrs.has(x)) nbrs.set(x, []);
      nbrs.get(x).push({ item: y, w: l.w });
    }
  }
  const row = new Map();
  order.forEach(col => col.forEach((item, i) => row.set(item, i)));

  const settle = col => {
    const items = order[col];
    const n = items.length;
    if (!n) return;
    const want = items.map((item, i) => {
      const ns = nbrs.get(item);
      if (!ns) return row.get(item) - i;
      let sw = 0, s = 0;
      for (const { item: o, w } of ns) { sw += w; s += w * row.get(o); }
      return s / sw - i;
    });
    // isotonic regression: want' non-decreasing
    const blocks = [];
    want.forEach(v => {
      blocks.push({ sum: v, n: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        blocks.pop(); a.sum += b.sum; a.n += b.n;
      }
    });
    let i = 0;
    for (const b of blocks) {
      const e = Math.min(Math.max(Math.round(b.sum / b.n), 0), cap - n);
      for (let k = 0; k < b.n; k++, i++) row.set(items[i], i + e);
    }
  };

  for (let pass = 0; pass < ROW_PASSES; pass++) {
    for (let col = 0; col < order.length; col++) settle(col);
    for (let col = order.length - 1; col >= 0; col--) settle(col);
  }

  // shift everything up so the topmost row is 0
  let min = Infinity;
  row.forEach(r => { min = Math.min(min, r); });
  if (min !== Infinity && min !== 0) row.forEach((r, item) => row.set(item, r - min));
  return row;
}

/**
 * @param {{elections: object[]}} data  normalised election data for one tab
 * @param {object} graph                from buildGraph()
 */
export function layoutGraph(data, graph) {
  const { columns, links, byId, edgePaths } = prepare(data, graph);
  const maxCount = Math.max(0, ...columns.map(c => c.length));
  const cap = Math.max(MIN_ROWS, maxCount);

  const { order, crossings } = orderColumns(columns, links);
  const row = assignRows(order, links, cap);

  const rows = data.elections.map(() => ({}));
  for (const item of byId.values()) if (!item.dummy) rows[item.col][item.card] = row.get(item);

  graph.edges.forEach((edge, i) => {
    if (!edge.pathTag) return;
    for (let col = 0; col < data.elections.length; col++) {
      const d = byId.get(`d|${edge.pathTag}|${col}`);
      if (d) edgePaths[i].push({ col, row: row.get(d) });
    }
  });

  let rowCount = 0;
  row.forEach(r => { rowCount = Math.max(rowCount, r + 1); });
  return { rows, edgePaths, rowCount, crossings };
}
