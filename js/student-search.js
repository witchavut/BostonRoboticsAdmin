(function (root) {
    'use strict';
    let nextId = 0;
    const normalize = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th');

    function create({ input, list, status, getItems, onSelect = () => {}, onQueryChange = () => {} }) {
        if (!input || !list || !status || typeof getItems !== 'function') throw new TypeError('Student search requires input, list, status, and getItems.');
        const document = input.ownerDocument;
        const cleanup = [], originalAttributes = new Map();
        let matches = [], activeIndex = -1, opened = false, requestedOpen = false, destroyed = false;
        const attributes = ['role', 'aria-autocomplete', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'autocomplete'];
        attributes.forEach(name => originalAttributes.set(name, input.getAttribute(name)));
        if (!list.id) list.id = `student-search-list-${++nextId}`;
        input.classList.add('student-search-input');
        list.classList.add('student-search-list');
        status.classList.add('student-search-status');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-haspopup', 'listbox');
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('autocomplete', 'off');
        list.setAttribute('role', 'listbox');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');

        function listen(target, type, callback) {
            target.addEventListener(type, callback);
            cleanup.push(() => target.removeEventListener(type, callback));
        }
        function close() {
            opened = false;
            requestedOpen = false;
            activeIndex = -1;
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }
        function setActive(index) {
            activeIndex = index;
            [...list.children].forEach((option, i) => {
                option.classList.toggle('is-active', i === index);
                option.setAttribute('aria-selected', String(i === index));
            });
            const option = list.children[index];
            if (option) {
                input.setAttribute('aria-activedescendant', option.id);
                option.scrollIntoView?.({ block: 'nearest' });
            } else input.removeAttribute('aria-activedescendant');
        }
        function render(show) {
            if (destroyed) return;
            const query = normalize(input.value);
            const items = getItems();
            matches = (Array.isArray(items) ? items : []).filter(item => item && normalize(item.label).includes(query));
            list.replaceChildren(...matches.map((item, index) => {
                const option = document.createElement('li');
                option.id = `${list.id}-option-${index}`;
                option.className = 'student-search-option';
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');
                option.dataset.searchIndex = String(index);
                option.textContent = String(item.label ?? '');
                return option;
            }));
            activeIndex = -1;
            input.removeAttribute('aria-activedescendant');
            status.textContent = matches.length ? `พบ ${matches.length} คน` : query ? 'ไม่พบชื่อนักเรียน' : 'ยังไม่มีรายชื่อนักเรียน';
            requestedOpen = !!show;
            opened = requestedOpen && matches.length > 0;
            list.hidden = !opened;
            input.setAttribute('aria-expanded', String(opened));
        }
        function refresh() { render(requestedOpen); }
        function choose(index) {
            const item = matches[index];
            if (!item) return;
            input.value = String(item.label ?? '');
            input.focus({ preventScroll: true });
            close();
            status.textContent = `เลือก ${item.label}`;
            onSelect(item);
        }
        function optionIndex(target) {
            const option = target?.closest?.('[role="option"]');
            return option && list.contains(option) ? Number(option.dataset.searchIndex) : -1;
        }

        listen(input, 'input', () => { onQueryChange(input.value); render(true); });
        listen(input, 'focus', () => render(true));
        listen(input, 'blur', close);
        listen(input, 'keydown', event => {
            if (event.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!opened) render(true);
                if (!matches.length) return;
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                setActive(activeIndex < 0 ? delta > 0 ? 0 : matches.length - 1 : (activeIndex + delta + matches.length) % matches.length);
            } else if (event.key === 'Enter' && opened && activeIndex >= 0) {
                event.preventDefault();
                choose(activeIndex);
            } else if (event.key === 'Escape' && requestedOpen) {
                event.preventDefault();
                close();
            } else if (event.key === 'Tab') close();
        });
        // Keep focus on the combobox until the click chooses an option, including on touch devices.
        listen(list, 'pointerdown', event => { if (optionIndex(event.target) >= 0) event.preventDefault(); });
        listen(list, 'mousedown', event => { if (optionIndex(event.target) >= 0) event.preventDefault(); });
        listen(list, 'click', event => { const index = optionIndex(event.target); if (index >= 0) choose(index); });
        listen(document, 'pointerdown', event => { if (event.target !== input && !list.contains(event.target)) close(); });
        close();

        return {
            refresh,
            close,
            getMatches: () => matches.slice(),
            destroy() {
                if (destroyed) return;
                close();
                destroyed = true;
                cleanup.forEach(remove => remove());
                list.replaceChildren();
                status.textContent = '';
                originalAttributes.forEach((value, name) => value == null ? input.removeAttribute(name) : input.setAttribute(name, value));
            }
        };
    }
    const api = { create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BostonStudentSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
