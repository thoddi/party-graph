/**
 * ElectionData — turns the raw election files into what the components work with.
 *
 * Each election in the data files has:
 *   - `date`:  ISO date ("1991-04-20"); month ("1990-05") or year ("1990") precision is allowed
 *              when the exact day is not known.
 *   - `label`: optional text for the column header, only needed when it differs from the year
 *              (e.g. "1942 (júlí)" when there are two elections in one year).
 *
 * normalize() adds:
 *   - `year`: numeric year, taken from `date`.
 *   - `key`:  unique id of the column (the label, or the year as text). Lines and card
 *             ids use it to tell columns apart, e.g. the two elections in 1942.
 */
export function normalizeElections(data) {
  for (const election of data.elections) {
    const year = parseInt(String(election.date).slice(0, 4), 10);
    if (isNaN(year)) throw new Error(`Election without a valid date: ${JSON.stringify(election.date)}`);
    election.year = year;
    election.label = election.label ?? String(year);
    election.key = election.label;
  }
  return data;
}
