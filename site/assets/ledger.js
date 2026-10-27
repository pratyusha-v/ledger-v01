// Tiny runtime for the few Ledger pages that have live state (marks entry,
// empty states). It renders the page template from a component's renderVals().
(function () {
  'use strict';

  function esc(v) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function lookup(vals, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, vals);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (update) {
    var next = typeof update === 'function' ? update(this.state) : update;
    this.state = Object.assign({}, this.state, next);
    if (this.__render) this.__render();
  };
  window.DCLogic = DCLogic;

  var BOOL_ATTRS = { checked: 1, disabled: 1, selected: 1, readonly: 1, hidden: 1 };

  function renderHTML(tpl, vals, handlers) {
    var html = tpl.replace(/<sc-if value="\{\{([^}]+)\}\}"[^>]*>([\s\S]*?)<\/sc-if>/g, function (m, p, inner) {
      return lookup(vals, p) ? inner : '';
    });
    html = html.replace(/\s([a-zA-Z-]+)="\{\{([^}]+)\}\}"/g, function (m, attr, p) {
      var v = lookup(vals, p);
      if (/^on[A-Z]/.test(attr)) {
        if (typeof v !== 'function') return '';
        handlers.push(v);
        return ' data-ev-' + attr.slice(2).toLowerCase() + '="' + (handlers.length - 1) + '"';
      }
      if (BOOL_ATTRS[attr.toLowerCase()]) return v ? ' ' + attr : '';
      return ' ' + attr + '="' + esc(v) + '"';
    });
    return html.replace(/\{\{([^}]+)\}\}/g, function (m, p) { return esc(lookup(vals, p)); });
  }

  function eventFor(el, name) {
    if (name !== 'change') return name;
    var t = (el.getAttribute('type') || '').toLowerCase();
    return (t === 'checkbox' || t === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
  }

  function controls(root) { return root.querySelectorAll('input, textarea, select, button'); }

  function mount(Component, props) {
    var tplEl = document.getElementById('ledger-tpl');
    var root = document.getElementById('ledger-root');
    if (!tplEl || !root) return;
    var tpl = tplEl.textContent;
    var comp = new Component(props);
    comp.props = props;

    comp.__render = function () {
      // Keep focus and caret across re-renders so typing feels normal.
      var active = document.activeElement, idx = -1, s0 = null, s1 = null;
      if (active && root.contains(active)) {
        idx = Array.prototype.indexOf.call(controls(root), active);
        try { s0 = active.selectionStart; s1 = active.selectionEnd; } catch (e) {}
      }
      var handlers = [];
      root.innerHTML = renderHTML(tpl, comp.renderVals(), handlers);
      root.querySelectorAll('textarea[value]').forEach(function (t) { t.value = t.getAttribute('value'); });
      root.querySelectorAll('*').forEach(function (el) {
        Array.prototype.slice.call(el.attributes).forEach(function (a) {
          if (a.name.indexOf('data-ev-') !== 0) return;
          var fn = handlers[+a.value];
          el.addEventListener(eventFor(el, a.name.slice(8)), function (e) { fn(e); });
        });
      });
      if (idx >= 0) {
        var el = controls(root)[idx];
        if (el) {
          el.focus();
          try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (e) {}
        }
      }
    };
    comp.__render();
    if ('emptyState' in props) addEmptyToggle(props);
  }

  // Prototype helper: flip a page between its filled and empty states.
  function addEmptyToggle(props) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ledger-proto';
    b.setAttribute('aria-pressed', props.emptyState ? 'true' : 'false');
    b.innerHTML = '<i aria-hidden="true"></i>Empty state';
    b.addEventListener('click', function () {
      var u = new URL(location.href);
      if (props.emptyState) u.searchParams.delete('emptyState');
      else u.searchParams.set('emptyState', '1');
      location.href = u.toString();
    });
    document.body.appendChild(b);
  }

  function propsFrom(defaults) {
    var q = new URLSearchParams(location.search), out = {};
    Object.keys(defaults).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      var d = defaults[k], v = d && 'default' in d ? d.default : undefined;
      if (q.has(k)) {
        var raw = q.get(k);
        v = typeof v === 'boolean' ? (raw === '1' || raw === 'true') : raw;
      }
      out[k] = v;
    });
    return out;
  }

  // Touch screens have no hover: tapping a dropdown's label opens it first.
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('.nv > [aria-haspopup]');
    var openNv = document.querySelectorAll('.nv.open');
    openNv.forEach(function (n) { if (!n.contains(e.target)) n.classList.remove('open'); });
    if (!trigger || !matchMedia('(hover: none)').matches) return;
    var nv = trigger.parentElement;
    if (!nv.classList.contains('open')) { e.preventDefault(); nv.classList.add('open'); }
  });

  window.Ledger = { mount: mount, propsFrom: propsFrom };
})();
