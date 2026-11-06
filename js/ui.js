// Small UI helpers: escaping, icons, formatting, bottom-sheet dialogs, toast.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const svg = (inner, { size = 22, stroke = 'currentColor', width = 2, fill = 'none' } = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icon = {
  back: (o) => svg('<path d="m15 18-6-6 6-6"/>', o),
  chevron: (o) => svg('<path d="m9 6 6 6-6 6"/>', { size: 18, stroke: '#9AA3AE', ...o }),
  target: (o) => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>', { size: 20, ...o }),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', { width: 2.6, ...o }),
  more: (o) => `<svg width="${o?.size || 20}" height="${o?.size || 20}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  search: (o) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', { size: 18, stroke: '#FF6A00', ...o }),
  external: (o) => svg('<path d="M7 17 17 7M8 7h9v9"/>', { size: 14, stroke: '#9AA3AE', ...o }),
  pencil: (o) => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', { size: 16, ...o }),
  trash: (o) => svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', { size: 20, ...o }),
  gear: (o) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', { size: 20, ...o }),
  days: (o) => svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>', o),
  extras: (o) => svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>', o),
  workouts: (o) => svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>', o),
};

/** "185 lbs × 8", or whichever half is filled in, or an em dash. */
export function formatLoad(v) {
  const w = (v?.weight || '').trim();
  const r = (v?.reps || '').trim();
  if (w && r) return `${w} × ${r}`;
  return w || (r ? `× ${r}` : '');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function toast(message, ms = 2200) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/**
 * Bottom-sheet dialog. Resolves { action, values }.
 * fields: [{ name, label, type: 'text'|'select', value, placeholder, required, options:[{value,label}], showIf:{field,value} }]
 * actions: [{ id, label, kind: 'primary'|'danger'|'' }] — first is the default (Enter) action.
 * list: true renders actions as a vertical menu instead of a button row.
 */
export function sheet({ title, message, fields = [], actions = [], list = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-label', title);
    const fieldHTML = (f) => {
      const show = f.showIf ? ` data-show-field="${esc(f.showIf.field)}" data-show-value="${esc(f.showIf.value)}"` : '';
      const control =
        f.type === 'select'
          ? `<select class="select" name="${esc(f.name)}">${f.options
              .map((o) => `<option value="${esc(o.value)}"${o.value === f.value ? ' selected' : ''}>${esc(o.label)}</option>`)
              .join('')}</select>`
          : `<input class="input" type="text" name="${esc(f.name)}" value="${esc(f.value)}" placeholder="${esc(f.placeholder)}" autocomplete="off"${f.required ? ' required' : ''}>`;
      return `<label class="field"${show}>${esc(f.label)}${control}</label>`;
    };
    const cancel = { id: 'cancel', label: 'Cancel' };
    const buttons = list
      ? `<div class="sheet-list">${actions
          .map((a) => `<button class="btn ${a.kind || ''}" value="${esc(a.id)}" formnovalidate>${esc(a.label)}</button>`)
          .join('')}<button class="btn" value="cancel" formnovalidate>Cancel</button></div>`
      : `<div class="sheet-actions">${actions
          .map((a) => `<button class="btn ${a.kind || ''}" value="${esc(a.id)}">${esc(a.label)}</button>`)
          .join('')}<button class="btn" value="${cancel.id}" formnovalidate>${cancel.label}</button></div>`;

    dlg.innerHTML = `<form method="dialog" class="sheet-inner">
      <h2 class="sheet-title">${esc(title)}</h2>
      ${message ? `<p class="sheet-msg">${esc(message)}</p>` : ''}
      ${fields.map(fieldHTML).join('')}
      ${buttons}
    </form>`;
    document.body.append(dlg);

    const form = dlg.querySelector('form');
    const syncVisibility = () => {
      dlg.querySelectorAll('[data-show-field]').forEach((el) => {
        const ctl = form.elements[el.dataset.showField];
        const visible = ctl && ctl.value === el.dataset.showValue;
        el.classList.toggle('hidden', !visible);
        const input = el.querySelector('input');
        if (input) input.required = visible;
      });
    };
    form.addEventListener('change', syncVisibility);
    syncVisibility();

    // Trim text fields before HTML validation runs, so "   " counts as empty.
    form.addEventListener('submit', (e) => {
      const submitter = e.submitter;
      if (submitter && submitter.value !== 'cancel' && !submitter.hasAttribute('formnovalidate')) {
        for (const input of form.querySelectorAll('input[type=text]')) input.value = input.value.trim();
        if (!form.checkValidity()) {
          e.preventDefault();
          form.reportValidity();
        }
      }
    });

    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('cancel');
    });
    dlg.addEventListener('close', () => {
      const values = {};
      for (const f of fields) values[f.name] = (form.elements[f.name]?.value ?? '').trim();
      const action = dlg.returnValue || 'cancel';
      dlg.remove();
      resolve({ action, values });
    });

    dlg.showModal();
    const first = dlg.querySelector('input:not(.hidden input), select');
    if (first && first.tagName === 'INPUT') {
      first.focus();
      first.select();
    } else {
      dlg.querySelector('.btn')?.blur();
    }
  });
}

export async function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true }) {
  const { action } = await sheet({
    title, message, actions: [{ id: 'ok', label: confirmLabel, kind: danger ? 'danger' : 'primary' }],
  });
  return action === 'ok';
}

export async function promptSheet({ title, label, value = '', placeholder = '', confirmLabel = 'Save' }) {
  const { action, values } = await sheet({
    title,
    fields: [{ name: 'v', label, value, placeholder, required: true }],
    actions: [{ id: 'ok', label: confirmLabel, kind: 'primary' }],
  });
  return action === 'ok' && values.v ? values.v : null;
}
