import PartyData from './partyData.js';

class ElectionGraph {
  constructor(partyData) {
    this.partyData = partyData;
  }

  renderColumns(data) {
    const columnsDiv = document.getElementById('columns');
    columnsDiv.innerHTML = '';
    data.elections.forEach((election) => {
      const colDiv = document.createElement('div');
      colDiv.className = 'column';
      const yearDiv = document.createElement('div');
      yearDiv.className = 'year';
      yearDiv.textContent = election.year;
      colDiv.appendChild(yearDiv);
      election.parties.forEach((party) => {
        if (!party || Object.keys(party).length === 0 || !party.id) {
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'party empty-party';
          colDiv.appendChild(emptyDiv);
          return;
        }
        const partyDiv = document.createElement('div');
        partyDiv.className = 'party';
        partyDiv.id = `party-${election.year}-${party.id}`;
        if (party.government === true) partyDiv.classList.add('government');
        const elected = party.elected !== false;
        if (!elected) partyDiv.classList.add('elected-false');
        let logo = this.partyData.getLogo(party.id, election.year);
        let partyName = party.name || this.partyData.getName(party.id);
        let nameDiv = document.createElement('div');
        nameDiv.textContent = partyName || '';
        nameDiv.style.pointerEvents = 'none';
        if (logo) {
          const img = document.createElement('img');
          img.src = logo;
          img.alt = partyName || '';
          partyDiv.appendChild(img);
          nameDiv.style.display = 'none';
          partyDiv.appendChild(nameDiv);
          partyDiv.addEventListener('mouseenter', () => { nameDiv.style.display = ''; });
          partyDiv.addEventListener('mouseleave', () => { nameDiv.style.display = 'none'; });
        } else {
          partyDiv.appendChild(nameDiv);
        }
        const votesDiv = document.createElement('div');
        votesDiv.textContent = party.votes;
        partyDiv.appendChild(votesDiv);
        colDiv.appendChild(partyDiv);
      });
      columnsDiv.appendChild(colDiv);
    });
  }

  // ...drawConnections, drawGroups, getBoxCenter (move here)
}

export default ElectionGraph;
