/** The tabs and the election file each one shows. */
export const DATASETS = {
  althingi: 'data.json',
  borgarstjorn: 'borgarstjorn_data.json',
};

/** "1923–2021 · 33 kosningar": the span and number of a list of normalised elections. */
export function describeElections(elections) {
  if (!elections.length) return '';
  const years = elections.map(e => e.year);
  const first = Math.min(...years), last = Math.max(...years);
  const span = first === last ? String(first) : `${first}–${last}`;
  return `${span} · ${elections.length} kosningar`;
}
