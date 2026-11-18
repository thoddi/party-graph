/**
 * PartyData — singleton service for loading and querying party metadata.
 * Loads from parties.json and provides logo/name lookups.
 */
class PartyData {
  static partiesById = {};
  static _loaded = false;

  static async load() {
    if (this._loaded) return;
    const response = await fetch('parties.json');
    const parties = await response.json();
    for (const p of parties) {
      this.partiesById[p.id] = p;
    }
    this._loaded = true;
  }

  /**
   * Value of a year-keyed map ({"1923": a, "2007": b}) that applies in `year`:
   * the entry with the latest key that is not after `year`.
   */
  static _valueForYear(map, year) {
    if (!map) return null;
    const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;
    let value = null;
    const years = Object.keys(map)
      .map(y => parseInt(y, 10))
      .filter(y => !isNaN(y))
      .sort((a, b) => a - b);
    for (const y of years) {
      if (y <= numericYear) value = map[y];
      else break;
    }
    return value;
  }

  static getLogo(partyId, year) {
    return this._valueForYear(this.getParty(partyId)?.logos, year) || null;
  }

  /** The formal name of the party. */
  static getName(partyId) {
    return this.getParty(partyId)?.name || '';
  }

  /**
   * The text shown on a party card in `year`: an era name from `names` if one applies,
   * otherwise `displayName` (may contain soft hyphens for wrapping), otherwise the name.
   */
  static getDisplayName(partyId, year) {
    const party = this.getParty(partyId);
    if (!party) return '';
    return this._valueForYear(party.names, year) || party.displayName || party.name || '';
  }

  static getParty(partyId) {
    return this.partiesById[partyId] || null;
  }
}

export default PartyData;
