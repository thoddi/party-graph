import PartyData from '../services/party-data.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 120px;
      height: 120px;
      border: 2px solid #ccc;
      border-radius: 18px;
      padding: 8px;
      text-align: center;
      background: #fff;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }
    :host(.elected-false) {
      border-color: #e22;
    }
    :host(.government) {
      box-shadow: 0 0 8px 3px #ffe066cc, 0 0 16px 6px #ffe06688;
    }
    :host(.empty) {
      border: none;
      background: none;
      box-shadow: none;
      pointer-events: none;
    }
    img {
      max-width: 80px;
      max-height: 80px;
      display: block;
      margin: 0 auto 4px;
    }
    .name {
      font-size: 12px;
      line-height: 1.2;
    }
    .votes {
      font-size: 11px;
      color: #666;
    }
  </style>
  <img part="logo" hidden>
  <div class="name" part="name"></div>
  <div class="votes" part="votes"></div>
`;

class PartyCard extends HTMLElement {
  static get observedAttributes() {
    return ['party-id', 'year', 'votes', 'name', 'elected', 'government', 'empty'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._img = this.shadowRoot.querySelector('img');
    this._nameEl = this.shadowRoot.querySelector('.name');
    this._votesEl = this.shadowRoot.querySelector('.votes');
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  _render() {
    const isEmpty = this.hasAttribute('empty');
    if (isEmpty) {
      this.classList.add('empty');
      this._img.hidden = true;
      this._nameEl.textContent = '';
      this._votesEl.textContent = '';
      return;
    }
    this.classList.remove('empty');

    const partyId = this.getAttribute('party-id');
    const year = this.getAttribute('year');
    const name = this.getAttribute('name') || PartyData.getName(partyId);
    const votes = this.getAttribute('votes');
    const elected = this.getAttribute('elected') !== 'false';
    const government = this.hasAttribute('government');

    this.classList.toggle('elected-false', !elected);
    this.classList.toggle('government', government);

    const logo = PartyData.getLogo(partyId, year);
    if (logo) {
      this._img.src = logo;
      this._img.alt = name;
      this._img.hidden = false;
    } else {
      this._img.hidden = true;
    }

    this._nameEl.textContent = name;
    this._votesEl.textContent = votes ? `${votes}%` : '';
  }
}

customElements.define('party-card', PartyCard);
export default PartyCard;
