class PartyData {
    static partiesById = {};

    static async load() {
        const response = await fetch('parties.json');
        const parties = await response.json();
        for (const p of parties) {
            this.partiesById[p.id] = p;
        }
    }

    static getLogo(partyId, year) {
        const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;
        let logo = null;
        const party = this.getParty(partyId);
        if (party && party.logos) {
            const logos = party.logos;
            const years = Object.keys(logos).map(y => parseInt(y, 10)).filter(y => !isNaN(y)).sort((a, b) => a - b);
            for (const y of years) {
                if (y <= numericYear) logo = logos[y];
                else break;
            }
            if (!logo) {
                for (const y in logos) {
                    if (parseInt(y, 10) <= numericYear) logo = logos[y];
                }
            }
        }
        return logo;
    }

    static getName(partyId) {
        return this.getParty(partyId)?.name || '';
    }

    static getParty(partyId) {
        return this.partiesById[partyId] || null;
    }
}

export default PartyData;
