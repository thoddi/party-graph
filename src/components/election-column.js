import './party-card.js';
import { CARD_SIZE, ROW_GAP, ROW_PITCH } from '../services/layout.js';

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
      display: grid;
      grid-template-columns: ${CARD_SIZE}px;
      gap: ${ROW_GAP}px;
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
    this._rows = {};
    this._rowCount = 0;
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

  /**
   * Where the cards go: `rows` maps a party id to its row, and `rowCount` is the height of
   * the whole graph, so that every column is equally tall (see services/layout.js).
   */
  setLayout(rows, rowCount) {
    this._rows = rows || {};
    this._rowCount = rowCount || 0;
    this._renderParties();
  }

  /** Vertical centre of a row, relative to the top of this column element. */
  rowCenterY(row) {
    const top = this._partiesContainer.getBoundingClientRect().top - this.getBoundingClientRect().top;
    return top + row * ROW_PITCH + CARD_SIZE / 2;
  }

  get parties() {
    return this._parties;
  }

  _renderYear() {
    this._yearLabel.textContent = this.getAttribute('label') || this.getAttribute('year') || '';
  }

  _renderParties() {
    this._partiesContainer.innerHTML = '';
    this._partiesContainer.style.gridTemplateRows = this._rowCount
      ? `repeat(${this._rowCount}, ${CARD_SIZE}px)` : '';
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
        if (this._rows[party.id] != null) card.style.gridRow = String(this._rows[party.id] + 1);
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
