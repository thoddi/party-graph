/**
 * ElectionData — turns the raw election files into what the components work with.
 *
 * Each election in the data files has:
 *   - `date`:  ISO date ("1991-04-20"); month ("1990-05") or year ("1990") precision is allowed
 *              when the exact day is not known.
 *   - `label`: optional text for the column header, only needed when it differs from the year
 *              (e.g. "1942 (júlí)" when there are two elections in one year).
 *   - `governments`: optional, the governments (or city majorities) that sat after the election,
 *              in order: [{ name?, from?, parties: ["id", ...] }]. Without it, every party with
 *              `"government": true` counts as one government.
 *
 * normalize() adds:
 *   - `year`: numeric year, taken from `date`.
 *   - `key`:  unique id of the column (the label, or the year as text). Lines and card
 *             ids use it to tell columns apart, e.g. the two elections in 1942.
 *   - `governments`: always a list (empty when there was none), and every party that is in at
 *             least one of them has `government: true`.
 */
export function normalizeElections(data) {
  for (const election of data.elections) {
    const year = parseInt(String(election.date).slice(0, 4), 10);
    if (isNaN(year)) throw new Error(`Election without a valid date: ${JSON.stringify(election.date)}`);
    election.year = year;
    election.label = election.label ?? String(year);
    election.key = election.label;
    election.governments = readGovernments(election);
  }
  return data;
}

function readGovernments(election) {
  if (election.governments == null) {
    const flagged = election.parties.filter(p => p?.government).map(p => p.id);
    return flagged.length ? [{ name: null, from: null, parties: flagged }] : [];
  }
  if (!Array.isArray(election.governments)) throw new Error(`${election.date}: "governments" must be a list`);
  const list = election.governments.map((g, i) => {
    if (!Array.isArray(g?.parties) || !g.parties.length) throw new Error(`${election.date}: government ${i + 1} needs a list of "parties"`);
    return { name: g.name ?? null, from: g.from ?? null, parties: [...g.parties] };
  });
  for (const p of election.parties) if (p?.id) p.government = list.some(g => g.parties.includes(p.id));
  return list;
}

/**
 * For one party in one election: whether it sat in each of the governments, in order,
 * e.g. [true, false, true]. Empty when it was in none, so `.length` is 0 for "no bar".
 */
export function governmentMembership(election, partyId) {
  const list = election.governments
    ?? (election.parties.find(p => p?.id === partyId)?.government ? [{ parties: [partyId] }] : []);
  const mask = list.map(g => g.parties.includes(partyId));
  return mask.some(Boolean) ? mask : [];
}
