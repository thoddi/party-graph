const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .group-circle {
      position: absolute;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #d22;
      border: 2px solid #333;
    }
    .group-label {
      position: absolute;
      font-size: 14px;
      text-align: center;
      transform: translateX(-50%);
    }
  </style>
  <slot></slot>
`;

/**
 * <party-group> — Represents a party split/merge event between two elections.
 * Rendered as a red circle with optional label, positioned between columns.
 * 
 * Note: The actual rendering of group nodes is handled within <connection-layer>
 * as SVG elements, since they need to be on the same SVG canvas as the lines.
 * This component exists as a data holder and can be used for future interactive features.
 */
class PartyGroup extends HTMLElement {
  static get observedAttributes() {
    return ['group-id', 'year', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._members = [];
    this._splitsTo = [];
  }

  get groupId() { return this.getAttribute('group-id'); }
  get year() { return parseFloat(this.getAttribute('year')); }
  get label() { return this.getAttribute('label') || ''; }

  set members(val) { this._members = val || []; }
  get members() { return this._members; }

  set splitsTo(val) { this._splitsTo = val || []; }
  get splitsTo() { return this._splitsTo; }
}

customElements.define('party-group', PartyGroup);
export default PartyGroup;
