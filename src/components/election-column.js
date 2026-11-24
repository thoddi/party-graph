import './party-card.js';
import { CARD_SIZE, ROW_GAP, rowCenter } from '../services/layout.js';
import { governmentMembership } from '../services/election-data.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 var(--col-gap, 40px);
    }
    /* stays at the top of the screen while the graph is scrolled down */
    .year-label {
      position: sticky;
      top: 0;
      z-index: 2;
      align-self: stretch;
      padding: 6px 0;
      margin-bottom: 4px;
      background: var(--bg);
      font-weight: bold;
      text-align: center;
      font-size: 16px;
    }
    .parties {
      display: grid;
      grid-template-columns: var(--card-size, ${CARD_SIZE}px);
      gap: var(--row-gap, ${ROW_GAP}px);
    }
  </style>
  <div class="year-label" part="year-label"></div>
  <div class="parties" part="parties"></div>
`;

class ElectionColumn extends HTMLElement {
  static get observedAttributes() {
    return ['year', 'label', 'kind'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._yearLabel = this.shadowRoot.querySelector('.year-label');
    this._partiesContainer = this.shadowRoot.querySelector('.parties');
    this._parties = [];
    this._election = null;   // the normalised election: needed for its governments
    this._rows = {};
    this._rowCount = 0;
  }

  connectedCallback() {
    this._renderYear();
  }

  attributeChangedCallback(name) {
    if (name === 'year' || name === 'label') this._renderYear();
    else if (name === 'kind') this._renderParties();
  }

  /** Numeric year of the election (used for logos and names). */
  get year() {
    return this.getAttribute('year');
  }

  /** Unique id of the column; differs from the year when there are two elections in one year. */
  get electionKey() {
    return this.getAttribute('election-key') || this.getAttribute('year');
  }

  /** The normalised election this column shows; set before `parties`. */
  set election(election) {
    this._election = election;
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
    const style = getComputedStyle(this._partiesContainer);   // the real size: it changes with the screen
    return top + rowCenter(row, parseFloat(style.gridTemplateColumns) || undefined, parseFloat(style.rowGap) || undefined);
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
      ? `repeat(${this._rowCount}, var(--card-size, ${CARD_SIZE}px))` : '';
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
        const mask = this._election ? governmentMembership(this._election, party.id) : (party.government ? [true] : []);
        if (mask.length) card.setAttribute('governments', mask.map(on => on ? '1' : '0').join(''));
        if (this.hasAttribute('kind')) card.setAttribute('kind', this.getAttribute('kind'));
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
    // an attribute selector: ids such as "a+b" are not valid after a #
    return this._partiesContainer.querySelector(`[id="${CSS.escape(`party-${this.electionKey}-${partyId}`)}"]`);
  }
}

customElements.define('election-column', ElectionColumn);
export default ElectionColumn;
