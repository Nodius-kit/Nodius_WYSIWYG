export interface ModalField {
  name: string;
  label: string;
  type: 'text' | 'url' | 'select';
  value?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ModalOptions {
  title: string;
  fields: ModalField[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

let styleInjected = false;

function injectStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.nodius-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: nodius-modal-fade-in 0.15s ease-out;
}
@keyframes nodius-modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.nodius-modal {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  min-width: 340px;
  max-width: 480px;
  width: 100%;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.nodius-modal-header {
  padding: 16px 20px 12px;
  font-size: 1rem;
  font-weight: 600;
  border-bottom: 1px solid #e2e8f0;
  color: #1e293b;
}
.nodius-modal-body {
  padding: 16px 20px;
}
.nodius-modal-field {
  margin-bottom: 12px;
}
.nodius-modal-field:last-child {
  margin-bottom: 0;
}
.nodius-modal-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #475569;
  margin-bottom: 4px;
}
.nodius-modal-input,
.nodius-modal-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.nodius-modal-input:focus,
.nodius-modal-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.15);
}
.nodius-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid #e2e8f0;
}
.nodius-modal-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s;
}
.nodius-modal-btn-cancel {
  background: #f1f5f9;
  color: #475569;
  border-color: #e2e8f0;
}
.nodius-modal-btn-cancel:hover {
  background: #e2e8f0;
}
.nodius-modal-btn-apply {
  background: #3b82f6;
  color: #fff;
}
.nodius-modal-btn-apply:hover {
  background: #2563eb;
}
`;
  document.head.appendChild(style);
}

export function createModal(options: ModalOptions): { overlay: HTMLElement; destroy: () => void } {
  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'nodius-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'nodius-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'nodius-modal-header';
  header.textContent = options.title;
  modal.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'nodius-modal-body';

  const inputs: Map<string, HTMLInputElement | HTMLSelectElement> = new Map();

  for (const field of options.fields) {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'nodius-modal-field';

    const label = document.createElement('label');
    label.className = 'nodius-modal-label';
    label.textContent = field.label;
    fieldDiv.appendChild(label);

    if (field.type === 'select' && field.options) {
      const select = document.createElement('select');
      select.className = 'nodius-modal-select';
      for (const opt of field.options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === field.value) option.selected = true;
        select.appendChild(option);
      }
      fieldDiv.appendChild(select);
      inputs.set(field.name, select);
    } else {
      const input = document.createElement('input');
      input.className = 'nodius-modal-input';
      input.type = field.type === 'url' ? 'url' : 'text';
      if (field.value) input.value = field.value;
      if (field.placeholder) input.placeholder = field.placeholder;
      fieldDiv.appendChild(input);
      inputs.set(field.name, input);
    }

    body.appendChild(fieldDiv);
  }
  modal.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'nodius-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'nodius-modal-btn nodius-modal-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.type = 'button';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'nodius-modal-btn nodius-modal-btn-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.type = 'button';

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function destroy(): void {
    overlay.remove();
  }

  function submit(): void {
    const values: Record<string, string> = {};
    for (const [name, input] of inputs) {
      values[name] = input.value;
    }
    destroy();
    options.onSubmit(values);
  }

  function cancel(): void {
    destroy();
    options.onCancel?.();
  }

  // Event listeners
  cancelBtn.addEventListener('click', cancel);
  applyBtn.addEventListener('click', submit);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cancel();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  // Focus first input
  const firstInput = inputs.values().next().value;
  if (firstInput) {
    requestAnimationFrame(() => {
      firstInput.focus();
      if (firstInput instanceof HTMLInputElement) {
        firstInput.select();
      }
    });
  }

  return { overlay, destroy };
}
