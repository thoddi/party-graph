/**
 * GraphModel — works out which lines and split/merge nodes to draw, from the
 * election data and the party metadata. It has no DOM code.
 *
 * ## Data it reads
 *
 * Each election (see election-data.js) has `date`, `key` and `parties`.
 * Each party in parties.json may have:
 *
 *   type     "group" for something that is not a party (a parliamentary group, a
 *            movement). A group has no card; it is drawn as a circle between two
 *            columns, at its `formed` date, and only when it has a line in and a
 *            line out in the tab being shown.
 *   formed   when it was formed (year, month or day precision).
 *   members  for a joint list: the parties that run on it. A member counts as
 *            "present" in every column where the joint list has a card, so lines
 *            run through the list instead of jumping over it.
 *   origins  where the party came from, one entry per source:
 *              from         id of the source party (or group)
 *              date         when it happened. When the exact date is not known, the
 *                           date of the first election afterwards.
 *              kind         "succession": a formal union, or this party is the
 *                                actual successor (solid line)
 *                           "defection":  some key members moved to this party
 *                                (dashed line)
 *              scope        "althingi", "borgarstjorn" or "both": the tabs where the
 *                           line is drawn. Required for a defection. A succession
 *                           without a scope is drawn in both.
 *              description  optional text shown when hovering the line
 *
 * ## Lines that are drawn
 *
 *   - continuation: a party's cards in two consecutive appearances are joined by a
 *     solid line, also across columns where it did not run (see `members`).
 *   - origin: from the source's last appearance before `date` to the party's first
 *     appearance on or after `date`.
 *   - group: from each source in the column before the group to the circle, and from
 *     the circle to each target in the column after it (see `buildNodes`).
 *
 * Several lines between the same two cards are drawn once; an origin wins over a
 * continuation.
 */

export const KINDS = { succession: 'succession', defection: 'defection' };

/**
 * Sortable string for a date of any precision. A date without a day counts as the end
 * of its period, so "1971" is after an election in June 1971 and "1990-05" is after one
 * on 1990-05-26.
 */
export function sortableDate(date) {
  const s = String(date);
  if (/^\d{4}$/.test(s)) return `${s}-12-31`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-31`;
  return s;
}

function appliesTo(origin, tab) {
  const scope = origin.scope ?? (origin.kind === KINDS.succession ? 'both' : null);
  return scope === 'both' || scope === tab;
}

/** Everywhere each party can be found in this tab: its own cards, and joint lists it is a member of. */
function collectAppearances(elections, partiesById) {
  const byParty = new Map();
  const add = (partyId, appearance) => {
    if (!byParty.has(partyId)) byParty.set(partyId, []);
    const list = byParty.get(partyId);
    const same = list.find(a => a.col === appearance.col);
    if (!same) list.push(appearance);                    // an own card beats a membership
    else if (appearance.own && !same.own) Object.assign(same, appearance);
  };
  elections.forEach((election, col) => {
    const base = { col, key: election.key, date: sortableDate(election.date) };
    for (const party of election.parties) {
      if (!party || !party.id) continue;
      add(party.id, { ...base, cardId: party.id, own: true });
      for (const member of partiesById[party.id]?.members ?? []) {
        add(member, { ...base, cardId: party.id, own: false });
      }
    }
  });
  for (const list of byParty.values()) list.sort((a, b) => a.col - b.col);
  return byParty;
}

/**
 * @param {{elections: object[]}} data    normalised election data for one tab
 * @param {Object<string, object>} partiesById
 * @param {string} tab                    "althingi" or "borgarstjorn"
 * @returns {{elections: object[], edges: object[], nodes: object[], warnings: string[]}}
 */
export function buildGraph(data, partiesById, tab) {
  const elections = data.elections;
  const warnings = [];
  const appearances = collectAppearances(elections, partiesById);
  const edges = new Map();           // "fromKey|fromCard|toKey|toCard" -> edge
  const addEdge = (from, to, kind, description, explicit) => {
    if (from.col >= to.col) return;
    const id = `${from.key}|${from.cardId}|${to.key}|${to.cardId}`;
    const old = edges.get(id);
    if (old && (old.explicit || !explicit)) return;
    edges.set(id, { fromKey: from.key, fromId: from.cardId, toKey: to.key, toId: to.cardId, kind, description, explicit });
  };

  // continuation lines
  for (const list of appearances.values()) {
    for (let i = 1; i < list.length; i++) addEdge(list[i - 1], list[i], KINDS.succession, undefined, false);
  }

  // origin lines and groups
  const groups = [];
  for (const [partyId, party] of Object.entries(partiesById)) {
    if (party.type === 'group') groups.push(party);
    for (const origin of party.origins ?? []) {
      if (!KINDS[origin.kind]) { warnings.push(`${partyId}: unknown kind "${origin.kind}" for origin from ${origin.from}`); continue; }
      if (origin.kind === KINDS.defection && !origin.scope) warnings.push(`${partyId}: defection from ${origin.from} has no scope`);
      if (!appliesTo(origin, tab) || party.type === 'group' || partiesById[origin.from]?.type === 'group') continue;
      const date = sortableDate(origin.date);
      const from = (appearances.get(origin.from) ?? []).filter(a => a.date < date).pop();
      const to = (appearances.get(partyId) ?? []).find(a => a.date >= date);
      if (from && to) addEdge(from, to, origin.kind, origin.description, true);
    }
  }

  return { elections, edges: [...edges.values()], nodes: buildNodes(groups, partiesById, elections, appearances, tab), warnings };
}

/**
 * Group nodes. A group sits between the last election on or before its `formed` date and
 * the next one. Its sources must be present in the column before it and its targets in the
 * column after it; with no line in or no line out in this tab it is not drawn.
 */
function buildNodes(groups, partiesById, elections, appearances, tab) {
  const nodes = [];
  for (const group of groups) {
    if (group.formed == null) continue;
    const formed = sortableDate(group.formed);
    let prev = -1;
    elections.forEach((e, i) => { if (sortableDate(e.date) <= formed) prev = i; });
    if (prev < 0 || prev + 1 >= elections.length) continue;
    const next = prev + 1;
    const at = (partyId, col) => (appearances.get(partyId) ?? []).find(a => a.col === col);

    const sources = [];
    for (const origin of group.origins ?? []) {
      if (!appliesTo(origin, tab)) continue;
      const a = at(origin.from, prev);
      if (a) sources.push({ key: a.key, id: a.cardId, kind: origin.kind });
    }
    const targets = [];
    for (const [partyId, party] of Object.entries(partiesById)) {
      for (const origin of party.origins ?? []) {
        if (origin.from !== group.id || !appliesTo(origin, tab)) continue;
        const a = at(partyId, next);
        if (a) targets.push({ key: a.key, id: a.cardId, kind: origin.kind });
      }
    }
    if (!sources.length || !targets.length) continue;
    nodes.push({ id: group.id, label: group.name ?? '', prevKey: elections[prev].key, nextKey: elections[next].key, sources, targets });
  }
  return nodes;
}
