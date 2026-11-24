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
      border: 2px solid var(--border);
      border-radius: 18px;
      padding: 8px;
      text-align: center;
      background: var(--surface);
      color: var(--fg);
      box-sizing: border-box;
      transition: border-color 0.2s, opacity 0.15s;
      cursor: pointer;
    }
    :host(:focus-visible) {
      outline: 3px solid var(--accent);
      outline-offset: 3px;
    }
    :host([highlighted]) {
      outline: 3px solid var(--fg);
      outline-offset: 2px;
    }
    :host([related]) {
      outline: 2px dashed var(--fg);
      outline-offset: 2px;
    }
    :host([dimmed]) {
      opacity: 0.3;
    }
    :host(.elected-false) {
      border-color: var(--not-elected);
    }
    :host(.government) {
      box-shadow: 0 0 8px 3px color-mix(in srgb, var(--gov) 80%, transparent), 0 0 16px 6px color-mix(in srgb, var(--gov) 53%, transparent);
    }
    :host(.empty) {
      border: none;
      background: none;
      box-shadow: none;
      pointer-events: none;
      cursor: default;
    }
    img {
      max-width: 80px;
      max-height: 80px;
      display: block;
      margin: 0 auto 4px;
      background: var(--logo-bg);
      border-radius: 6px;
    }
    .name {
      font-size: 12px;
      line-height: 1.2;
    }
    .votes {
      font-size: 11px;
      color: var(--muted);
    }
  </style>
  <img part="logo" hidden>
  <div class="name" part="name"></div>
  <div class="votes" part="votes"></div>
`;

class PartyCard extends HTMLElement {
  static get observedAttributes() {
    return ['party-id', 'year', 'votes', 'elected', 'government', 'empty', 'highlighted'];
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
      this.removeAttribute('tabindex');
      this.removeAttribute('role');
      this.removeAttribute('aria-label');
      return;
    }
    this.classList.remove('empty');

    const partyId = this.getAttribute('party-id');
    const year = this.getAttribute('year');
    const name = PartyData.getName(partyId);
    const displayName = PartyData.getDisplayName(partyId, year);
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

    this._nameEl.textContent = displayName;
    this._votesEl.textContent = votes ? `${votes}%` : '';

    // keyboard and screen readers: one focusable button per card
    this.tabIndex = 0;
    this.setAttribute('role', 'button');
    this.setAttribute('aria-pressed', this.hasAttribute('highlighted') ? 'true' : 'false');
    this.setAttribute('aria-label', [
      name, year, votes ? `${votes}%` : '',
      elected ? '' : 'ekki kjörinn',
      government ? 'í ríkisstjórn' : '',
    ].filter(Boolean).join(', '));
  }
}

customElements.define('party-card', PartyCard);
export default PartyCard;
