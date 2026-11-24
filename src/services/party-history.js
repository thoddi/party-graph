/**
 * PartyHistory — everything the detail panel shows about one party, worked out from the
 * party metadata and the election files. It has no DOM code.
 *
 * @param {string} partyId
 * @param {Object<string, object>} partiesById        from parties.json
 * @param {Object<string, {elections: object[]}>} datasets  normalised election data by tab
 * @returns {object|null} null for an unknown id
 *
 *   name, formed, disbanded, type
 *   logos       [{ from: year, src }]: each logo once, in order
 *   origins     where it came from: [{ id, name, date, kind, scope, description }]
 *   successors  parties that list this one as an origin: same shape
 *   results     per tab, one row per election it ran in:
 *                 { key, label, year, votes, elected, government, via }
 *               `via` is the name of the joint list when it ran as a member of one
 */
export function partyHistory(partyId, partiesById, datasets) {
  const party = partiesById[partyId];
  if (!party) return null;
  const nameOf = id => partiesById[id]?.name ?? id;

  const logos = [];
  const years = Object.keys(party.logos ?? {}).map(Number).filter(y => !isNaN(y)).sort((a, b) => a - b);
  for (const y of years) {
    const src = party.logos[y];
    if (logos[logos.length - 1]?.src !== src) logos.push({ from: y, src });
  }

  const link = (id, o) => ({ id, name: nameOf(id), date: o.date, kind: o.kind, scope: o.scope ?? null, description: o.description ?? null });
  const origins = (party.origins ?? []).map(o => link(o.from, o));
  const successors = [];
  for (const [id, other] of Object.entries(partiesById)) {
    for (const o of other.origins ?? []) if (o.from === partyId) successors.push(link(id, o));
  }
  const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
  origins.sort(byDate);
  successors.sort(byDate);

  const results = {};
  for (const [tab, data] of Object.entries(datasets)) {
    results[tab] = [];
    for (const election of data?.elections ?? []) {
      const own = election.parties.find(p => p?.id === partyId);
      const joint = own ? null : election.parties.find(p => p?.id && partiesById[p.id]?.members?.includes(partyId));
      const entry = own ?? joint;
      if (!entry) continue;
      results[tab].push({
        key: election.key, label: election.label, year: election.year,
        votes: entry.votes ?? null,
        elected: entry.elected !== false,
        government: !!entry.government,
        via: joint ? nameOf(joint.id) : null,
      });
    }
  }

  return { id: partyId, name: party.name ?? partyId, type: party.type ?? 'party', formed: party.formed ?? null, disbanded: party.disbanded ?? null, note: party.note ?? null, logos, origins, successors, results };
}
