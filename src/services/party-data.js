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

  static getLogo(partyId, year) {
    const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;
    let logo = null;
    const party = this.getParty(partyId);
    if (party && party.logos) {
      const logos = party.logos;
      const years = Object.keys(logos)
        .map(y => parseInt(y, 10))
        .filter(y => !isNaN(y))
        .sort((a, b) => a - b);
      for (const y of years) {
        if (y <= numericYear) logo = logos[y];
        else break;
      }
    }
    return logo || null;
  }

  static getName(partyId) {
    return this.getParty(partyId)?.name || '';
  }

  static getParty(partyId) {
    return this.partiesById[partyId] || null;
  }
}

export default PartyData;
