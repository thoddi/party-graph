const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      --panel-bg: var(--surface);
      --panel-fg: var(--fg);
      --panel-muted: var(--muted);
      --panel-border: var(--border);
      position: fixed;
      z-index: 20;
      right: 0;
      top: 0;
      bottom: 0;
      width: 360px;
      display: none;
      background: var(--panel-bg);
      color: var(--panel-fg);
      border-left: 1px solid var(--panel-border);
      box-shadow: -2px 0 10px var(--shadow);
      overflow-y: auto;
      font-family: inherit;
      font-size: 14px;
    }
    :host([open]) { display: block; }
    .inner { padding: 16px; }
    header { display: flex; gap: 12px; align-items: flex-start; }
    h2 { margin: 0; font-size: 20px; flex: 1; }
    h2:focus { outline: none; }
    h3 { margin: 18px 0 6px; font-size: 14px; }
    .close {
      font-size: 20px; line-height: 1; padding: 6px 10px; cursor: pointer;
      border: 1px solid var(--panel-border); border-radius: 6px; background: transparent; color: inherit;
    }
    .close:focus-visible, .link:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    .meta { color: var(--panel-muted); margin: 4px 0 0; }
    .logos { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; }
    .logo { margin: 0; text-align: center; font-size: 11px; color: var(--panel-muted); flex: 0 0 auto; }
    .logo img { display: block; max-width: 44px; max-height: 44px; margin: 0 auto 2px; background: var(--logo-bg); border-radius: 4px; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { margin: 4px 0; }
    .link { background: none; border: none; padding: 0; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
    .kind { color: var(--panel-muted); }
    table { border-collapse: collapse; width: 100%; margin-top: 6px; }
    th, td { text-align: left; padding: 3px 6px 3px 0; border-bottom: 1px solid var(--panel-border); vertical-align: top; }
    td.num, th.num { text-align: right; }
    svg.spark { display: block; width: 100%; height: 56px; }
    .empty { color: var(--panel-muted); }
    @media (max-width: 700px) {
      :host { top: auto; left: 0; width: auto; height: 60vh; border-left: none; border-top: 1px solid var(--panel-border); box-shadow: 0 -2px 10px var(--shadow); }
    }
  </style>
  <div class="inner" role="dialog" aria-labelledby="title">
    <header>
      <h2 id="title" tabindex="-1"></h2>
      <button class="close" type="button" aria-label="Loka">✕</button>
    </header>
    <div class="body"></div>
  </div>
`;

import { governmentPhrase } from '../services/datasets.js';

const TAB_TITLES = { althingi: 'Alþingiskosningar', borgarstjorn: 'Borgarstjórnarkosningar' };
const KIND_TEXT = { succession: 'framhald', defection: 'hluti fór' };
const SVG = 'http://www.w3.org/2000/svg';

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (className) e.className = className;
  return e;
}

/**
 * <party-panel> — details of one party (see services/party-history.js): name, logos, where it
 * came from and what it became, and its result in every election.
 *
 * `show(history, { focus })` opens it and `hide()` closes it. It fires `party-select`
 * (detail: the party id) when a related party is picked, and `panel-close` on ✕.
 * Text is added with textContent only, never as HTML.
 */
class PartyPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._title = this.shadowRoot.getElementById('title');
    this._body = this.shadowRoot.querySelector('.body');
    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.dispatchEvent(new CustomEvent('panel-close')));
  }

  get isOpen() { return this.hasAttribute('open'); }

  show(history, { focus = false } = {}) {
    this._title.textContent = history.name;
    this._body.replaceChildren(...this._sections(history));
    this.setAttribute('open', '');
    if (focus) this._title.focus();
  }

  hide() {
    const hadFocus = this.shadowRoot.activeElement != null;
    this.removeAttribute('open');
    return hadFocus;
  }

  _sections(h) {
    const out = [];
    const facts = [h.formed ? `Stofnaður ${h.formed}` : null, h.disbanded ? `lagður niður ${h.disbanded}` : null].filter(Boolean).join(', ');
    if (facts) out.push(el('p', facts, 'meta'));
    if (h.note) out.push(el('p', h.note, 'meta'));

    if (h.logos.length) {
      const wrap = el('div', null, 'logos');
      for (const logo of h.logos) {
        const fig = el('figure', null, 'logo');
        const img = document.createElement('img');
        img.src = logo.src;
        img.alt = `Merki ${h.name} frá ${logo.from}`;
        fig.append(img, el('figcaption', String(logo.from)));
        wrap.append(fig);
      }
      out.push(wrap);
    }

    out.push(this._links('Kom frá', h.origins));
    out.push(this._links('Varð að', h.successors));

    for (const [tab, rows] of Object.entries(h.results)) {
      if (!rows.length) continue;
      out.push(el('h3', `${TAB_TITLES[tab] ?? tab} (${rows.length})`));
      out.push(this._spark(rows));
      out.push(this._table(rows, tab));
    }
    return out;
  }

  _links(heading, list) {
    const box = el('div');
    box.append(el('h3', heading));
    if (!list.length) { box.append(el('p', 'Ekkert skráð', 'empty')); return box; }
    const ul = el('ul');
    for (const o of list) {
      const li = el('li');
      const b = el('button', o.name, 'link');
      b.type = 'button';
      b.addEventListener('click', () => this.dispatchEvent(new CustomEvent('party-select', { detail: o.id })));
      const when = String(o.date).slice(0, 4);
      li.append(b, el('span', ` · ${KIND_TEXT[o.kind] ?? o.kind}, ${when}`, 'kind'));
      ul.append(li);
    }
    box.append(ul);
    return box;
  }

  /** A line of vote share over the elections. Decorative: the table has the same numbers. */
  _spark(rows) {
    const pts = rows.filter(r => r.votes != null);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'spark');
    svg.setAttribute('viewBox', '0 0 300 56');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    if (!pts.length) return svg;
    const max = Math.max(...pts.map(r => r.votes), 1);
    const x = i => pts.length === 1 ? 150 : 6 + (288 * i) / (pts.length - 1);
    const y = v => 50 - (44 * v) / max;
    const line = document.createElementNS(SVG, 'polyline');
    line.setAttribute('points', pts.map((r, i) => `${x(i)},${y(r.votes)}`).join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    svg.append(line);
    if (pts.length <= 15) pts.forEach((r, i) => {   // dots only when there are few enough to tell apart
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(r.votes)); dot.setAttribute('r', 3);
      dot.setAttribute('fill', r.elected ? 'currentColor' : 'none');   // hollow: not elected
      dot.setAttribute('stroke', 'currentColor');
      svg.append(dot);
    });
    return svg;
  }

  _table(rows, tab) {
    const table = el('table');
    const head = el('tr');
    for (const [t, cls] of [['Kosning'], ['Fylgi', 'num'], ['Staða']]) { const th = el('th', t, cls); th.scope = 'col'; head.append(th); }
    table.append(head);
    for (const r of rows) {
      const tr = el('tr');
      const { in: inCount, total, names } = r.governments;
      let gov = governmentPhrase(tab, inCount, total);
      if (gov && names.length) gov += ` (${names.join(', ')})`;
      const status = [r.elected ? 'Kjörinn' : 'Ekki kjörinn', gov].filter(Boolean).join(', ');
      tr.append(
        el('td', r.label),
        el('td', r.votes != null ? `${r.votes}%` : '–', 'num'),
        el('td', r.via ? `${status} (á lista ${r.via})` : status),
      );
      table.append(tr);
    }
    return table;
  }
}

customElements.define('party-panel', PartyPanel);
export default PartyPanel;
