export const DEFAULT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC',
  '#D32F2F', '#E64A19', '#F57C00', '#FBC02D', '#689F38', '#388E3C',
  '#0288D1', '#1976D2', '#303F9F', '#512DA8', '#7B1FA2', '#C2185B',
];

export interface ColorPickerOptions {
  colors: string[];
  currentColor?: string;
  onSelect: (color: string) => void;
  onRemove?: () => void;
  anchorEl: HTMLElement;
}

let pickerStyleInjected = false;

function injectPickerStyles(): void {
  if (pickerStyleInjected) return;
  pickerStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.nodius-color-picker {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 8px;
  z-index: 200;
  display: grid;
  grid-template-columns: repeat(6, 24px);
  gap: 3px;
}
.nodius-color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  box-sizing: border-box;
  transition: border-color 0.1s, transform 0.1s;
}
.nodius-color-swatch:hover {
  transform: scale(1.15);
}
.nodius-color-swatch.selected {
  border-color: #3b82f6;
}
.nodius-color-remove {
  grid-column: 1 / -1;
  margin-top: 4px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #475569;
  text-align: center;
}
.nodius-color-remove:hover {
  background: #f1f5f9;
}
`;
  document.head.appendChild(style);
}

export function createColorPicker(opts: ColorPickerOptions): { el: HTMLElement; destroy: () => void } {
  injectPickerStyles();

  const el = document.createElement('div');
  el.className = 'nodius-color-picker';

  // Position below the anchor
  const rect = opts.anchorEl.getBoundingClientRect();
  const parentRect = opts.anchorEl.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  el.style.left = `${rect.left - parentRect.left}px`;
  el.style.top = `${rect.bottom - parentRect.top + 4}px`;

  for (const color of opts.colors) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'nodius-color-swatch';
    if (opts.currentColor === color) swatch.classList.add('selected');
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onSelect(color);
    });
    el.appendChild(swatch);
  }

  if (opts.onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nodius-color-remove';
    removeBtn.textContent = 'Remove color';
    removeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.onRemove!();
    });
    el.appendChild(removeBtn);
  }

  return {
    el,
    destroy() {
      el.remove();
    },
  };
}
