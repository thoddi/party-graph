import PartyData from '../services/party-data.js';
import { governmentPhrase } from '../services/datasets.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: var(--card-size, 120px);
      height: var(--card-size, 120px);
      border: 2px solid var(--border-strong);
      border-radius: 18px;
      padding: 8px;
      text-align: center;
      background: var(--surface);
      color: var(--fg);
      box-sizing: border-box;
      transition: border-color 0.2s, opacity 0.15s;
      cursor: pointer;
      position: relative;
      scroll-margin-top: 72px;   /* clears the sticky year labels when scrolled to */
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
      border-style: dashed;   /* not only red: the dashes tell it apart without colour */
      border-color: var(--not-elected);
    }
    /* One segment per government of the term: filled when the party sat in it, an outline when not. */
    .gov {
      position: absolute;
      left: 50%;
      bottom: -11px;
      transform: translateX(-50%);
      display: flex;
      gap: 3px;
      padding: 2px 4px;
      background: var(--bg);
      border-radius: 6px;
    }
    .gov[hidden] { display: none; }
    .gov i {
      width: 16px;
      height: 6px;
      border: 1.5px solid var(--gov-bar);
      border-radius: 3px;
    }
    .gov i.in { background: var(--gov-bar); }
    :host(.empty) {
      border: none;
      background: none;
      box-shadow: none;
      pointer-events: none;
      cursor: default;
    }
    img {
      max-width: calc(var(--card-size, 120px) * 0.5);
      max-height: calc(var(--card-size, 120px) * 0.5);
      display: block;
      margin: 0 auto 4px;
      background: var(--logo-bg);
      border-radius: 6px;
    }
    .name {
      max-width: 100%;
      font-size: 12px;
      line-height: 1.2;
      overflow-wrap: anywhere;   /* a long name breaks inside the card instead of spilling out */
      hyphens: auto;
    }
    .votes {
      font-size: 11px;
      color: var(--muted);
    }
    @media (max-width: 700px) {
      :host { padding: 4px; border-radius: 14px; }
      img { max-width: calc(var(--card-size, 120px) * 0.42); max-height: calc(var(--card-size, 120px) * 0.42); margin-bottom: 2px; }
      .name { font-size: 10.5px; }
      .votes { font-size: 10px; }
      .gov i { width: 12px; }
    }
  </style>
  <img part="logo" hidden>
  <div class="name" part="name"></div>
  <div class="votes" part="votes"></div>
  <div class="gov" part="government" hidden></div>
`;

class PartyCard extends HTMLElement {
  static get observedAttributes() {
    return ['party-id', 'year', 'votes', 'elected', 'governments', 'kind', 'empty', 'highlighted'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._img = this.shadowRoot.querySelector('img');
    this._nameEl = this.shadowRoot.querySelector('.name');
    this._votesEl = this.shadowRoot.querySelector('.votes');
    this._govEl = this.shadowRoot.querySelector('.gov');
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
      this._govEl.hidden = true;
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
    // `governments` is one digit per government of the term: "101" = in the 1st and 3rd
    const mask = [...(this.getAttribute('governments') ?? '')].map(c => c === '1');
    const inCount = mask.filter(Boolean).length;

    this.classList.toggle('elected-false', !elected);
    this._govEl.replaceChildren(...mask.map(on => {
      const seg = document.createElement('i');
      seg.classList.toggle('in', on);
      return seg;
    }));
    this._govEl.hidden = !inCount;

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
      governmentPhrase(this.getAttribute('kind'), inCount, mask.length),
    ].filter(Boolean).join(', '));
  }
}

customElements.define('party-card', PartyCard);
export default PartyCard;
