import './party-card.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 40px;
    }
    .year-label {
      font-weight: bold;
      text-align: center;
      margin-bottom: 10px;
      font-size: 16px;
    }
    .parties {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
  </style>
  <div class="year-label" part="year-label"></div>
  <div class="parties" part="parties"></div>
`;

class ElectionColumn extends HTMLElement {
  static get observedAttributes() {
    return ['year', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._yearLabel = this.shadowRoot.querySelector('.year-label');
    this._partiesContainer = this.shadowRoot.querySelector('.parties');
    this._parties = [];
  }

  connectedCallback() {
    this._renderYear();
  }

  attributeChangedCallback(name) {
    if (name === 'year' || name === 'label') this._renderYear();
  }

  /** Numeric year of the election (used for logos and names). */
  get year() {
    return this.getAttribute('year');
  }

  /** Unique id of the column; differs from the year when there are two elections in one year. */
  get electionKey() {
    return this.getAttribute('election-key') || this.getAttribute('year');
  }

  set parties(partyList) {
    this._parties = partyList || [];
    this._renderParties();
  }

  get parties() {
    return this._parties;
  }

  _renderYear() {
    this._yearLabel.textContent = this.getAttribute('label') || this.getAttribute('year') || '';
  }

  _renderParties() {
    this._partiesContainer.innerHTML = '';
    const year = this.getAttribute('year');

    this._parties.forEach(party => {
      const card = document.createElement('party-card');
      if (!party || Object.keys(party).length === 0 || !party.id) {
        card.setAttribute('empty', '');
      } else {
        card.setAttribute('party-id', party.id);
        card.setAttribute('year', year);
        if (party.votes != null) card.setAttribute('votes', party.votes);
        if (party.elected === false) card.setAttribute('elected', 'false');
        if (party.government) card.setAttribute('government', '');
        card.id = `party-${this.electionKey}-${party.id}`;
      }
      this._partiesContainer.appendChild(card);
    });
  }

  getPartyCardElements() {
    return Array.from(this._partiesContainer.querySelectorAll('party-card'));
  }

  getPartyCardById(partyId) {
    return this._partiesContainer.querySelector(`#party-${this.electionKey}-${partyId}`);
  }
}

customElements.define('election-column', ElectionColumn);
export default ElectionColumn;
