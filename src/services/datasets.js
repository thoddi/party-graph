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

/** Words for a government: the Alþingi has ríkisstjórn, the city council a meirihluti. */
export const GOVERNMENT_TEXT = {
  althingi: { single: 'í ríkisstjórn', plural: 'ríkisstjórnum', noun: 'Ríkisstjórn' },
  borgarstjorn: { single: 'í meirihluta', plural: 'meirihlutum', noun: 'Meirihluti' },
};

/** "í ríkisstjórn", or "í 2 af 3 ríkisstjórnum kjörtímabilsins"; '' when it was in none. */
export function governmentPhrase(type, inCount, total) {
  const t = GOVERNMENT_TEXT[type] ?? GOVERNMENT_TEXT.althingi;
  if (!inCount) return '';
  return total <= 1 ? t.single : `í ${inCount} af ${total} ${t.plural} kjörtímabilsins`;
}
