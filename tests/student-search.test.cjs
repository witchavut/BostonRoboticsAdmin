const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/student-search.js');

class Element extends EventTarget {
  constructor(document, tag = 'div') {
    super(); this.ownerDocument = document; this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this.value = ''; this.textContent = ''; this.id = ''; this.hidden = false; this.parentElement = null;
    const classes = new Set();
    this.classList = { add: c => classes.add(c), toggle: (c, force) => force ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  replaceChildren(...children) { this.children.forEach(c => c.parentElement = null); this.children = children; children.forEach(c => c.parentElement = this); }
  contains(element) { return element === this || this.children.some(c => c.contains(element)); }
  closest(selector) { return selector === '[role="option"]' && this.getAttribute('role') === 'option' ? this : this.parentElement?.closest(selector); }
  focus() { if (this.ownerDocument.activeElement === this) return; this.ownerDocument.activeElement = this; this.dispatchEvent(new Event('focus')); }
  scrollIntoView() {}
}
function setup(items = [{ id: 'A', label: 'ปุญญ์ (ปุญญ์ ทดสอบ)' }, { id: 'B', label: 'ปันปัน' }, { id: 'C', label: 'บอส' }]) {
  const document = new EventTarget(); document.createElement = tag => new Element(document, tag);
  const input = document.createElement('input'), list = document.createElement('ul'), status = document.createElement('p');
  list.id = 'names';
  const chosen = [], queries = [];
  const search = create({ input, list, status, getItems: () => items, onSelect: item => chosen.push(item), onQueryChange: query => queries.push(query) });
  function type(value) { input.value = value; input.dispatchEvent(new Event('input')); }
  function key(key, props = {}) { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key, ...props }); input.dispatchEvent(event); return event; }
  function pointer(type, target, dispatcher = list) { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); dispatcher.dispatchEvent(event); return event; }
  return { document, input, list, status, items, search, chosen, queries, type, key, pointer };
}

test('the first Thai character immediately filters supplied names and announces the count', () => {
  const s = setup(); s.input.focus();
  assert.equal(s.list.children.length, 3);
  s.type('ป');
  assert.deepEqual(s.search.getMatches().map(x => x.id), ['A', 'B']);
  assert.equal(s.status.textContent, 'พบ 2 คน');
  assert.equal(s.input.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(s.queries, ['ป']);
  s.type('ทด'); assert.deepEqual(s.search.getMatches().map(x => x.id), ['A']);
});

test('click selects one supplied deduplicated identity and keeps list focus from dropping before click', () => {
  const item = { id: 'one-person', label: 'ปุญญ์' }, s = setup([item]);
  s.input.focus(); s.type('ป');
  assert.equal(s.pointer('pointerdown', s.list.children[0]).defaultPrevented, true);
  s.pointer('click', s.list.children[0]);
  assert.deepEqual(s.chosen, [item]);
  assert.equal(s.input.value, 'ปุญญ์');
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.getAttribute('aria-activedescendant'), null);
  assert.equal(s.status.textContent, 'เลือก ปุญญ์');
});

test('arrows and Enter select using aria-activedescendant without moving input focus', () => {
  const s = setup(); s.input.focus(); s.type('ป');
  assert.equal(s.key('ArrowDown').defaultPrevented, true);
  assert.equal(s.input.getAttribute('aria-activedescendant'), 'names-option-0');
  assert.equal(s.list.children[0].getAttribute('aria-selected'), 'true');
  s.key('ArrowUp'); assert.equal(s.input.getAttribute('aria-activedescendant'), 'names-option-1');
  s.key('Enter');
  assert.equal(s.chosen[0].id, 'B');
  assert.equal(s.document.activeElement, s.input);
  assert.equal(s.list.hidden, true);
});

test('Escape, Tab, blur and outside pointer close suggestions without changing the query', () => {
  const s = setup(); s.input.focus(); s.type('ป'); s.key('ArrowDown');
  assert.equal(s.key('Escape').defaultPrevented, true);
  assert.equal(s.input.value, 'ป'); assert.equal(s.list.hidden, true);
  s.key('ArrowDown'); assert.equal(s.list.hidden, false);
  assert.equal(s.key('Tab').defaultPrevented, false); assert.equal(s.list.hidden, true);
  s.type('ป'); s.input.dispatchEvent(new Event('blur')); assert.equal(s.list.hidden, true);
  s.type('ป'); s.pointer('pointerdown', s.document.createElement('button'), s.document); assert.equal(s.list.hidden, true);
  assert.deepEqual(s.chosen, []);
});

test('no results are announced and native search clearing restores supplied names', () => {
  const s = setup(); s.input.focus(); s.type('ไม่รู้จัก');
  assert.equal(s.status.textContent, 'ไม่พบชื่อนักเรียน');
  assert.equal(s.list.hidden, true); assert.equal(s.list.children.length, 0);
  s.key('ArrowDown'); s.key('Enter'); assert.deepEqual(s.chosen, []);
  s.type(''); assert.equal(s.list.children.length, 3); assert.equal(s.queries.at(-1), '');
});

test('labels remain text and refresh reflects data changes without opening an unfocused search', () => {
  const s = setup([{ id: 'safe', label: '<img src=x onerror=alert(1)>' }]);
  s.search.refresh(); assert.equal(s.list.hidden, true);
  assert.equal(s.list.children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(s.list.children[0].children.length, 0);
  s.items.push({ id: 'new', label: 'ใหม่' }); s.input.focus(); s.type('ใหม่');
  assert.deepEqual(s.search.getMatches().map(x => x.id), ['new']);
});

test('composition does not commit an option and destroy removes listeners and combobox attributes', () => {
  const s = setup(); s.input.focus(); s.key('ArrowDown');
  s.key('Enter', { isComposing: true }); assert.deepEqual(s.chosen, []);
  s.search.destroy(); assert.equal(s.input.getAttribute('role'), null); assert.equal(s.list.hidden, true);
  s.type('ป'); assert.deepEqual(s.queries, []); assert.equal(s.list.children.length, 0);
});

test('refresh from the selection callback keeps suggestions closed while the input stays focused', () => {
  const s = setup();
  s.input.focus(); s.type('ป'); s.key('ArrowDown'); s.key('Enter');
  s.search.refresh();
  assert.equal(s.document.activeElement, s.input);
  assert.equal(s.list.hidden, true);
  assert.equal(s.input.getAttribute('aria-expanded'), 'false');
  s.type('ใหม่'); s.items.push({ id: 'loaded', label: 'ใหม่' }); s.search.refresh();
  assert.equal(s.list.hidden, false);
  assert.deepEqual(s.search.getMatches().map(item => item.id), ['loaded']);
});
