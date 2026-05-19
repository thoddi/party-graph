import PartyData from './partyData.js';

class PartyCard {
    constructor(party, year) {
        const card = document.createElement('div');
        card.className = 'party';
        card.id = `party-${year}-${party.id}`;

        if (!party || Object.keys(party).length === 0) {
            card.classList.add('empty-party');
        }
        if (party.government === true) {
            card.classList.add('government');
        }
        if (party.elected !== true) {
            card.classList.add('elected-false');
        }

        const logo = PartyData.getLogo(party.id, year);
        if (logo) {
            const img = document.createElement('img');
            img.src = logo;
            img.alt = party.name || '';
            card.appendChild(img);
        }

        const nameDiv = document.createElement('div');
        nameDiv.textContent = party.name || '';
        card.appendChild(nameDiv);

        const votesDiv = document.createElement('div');
        votesDiv.textContent = `${party.votes}%`;
        card.appendChild(votesDiv);

        this.card = card;
    }
}