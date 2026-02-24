import type { PluginDefinition } from '../core/types';

const BASE_CSS = `
.nodius-editor {
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.nodius-editable {
  padding: 12px 16px;
  min-height: 100px;
  outline: none;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  display: flow-root;
}
.nodius-editable:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
  pointer-events: none;
}
.nodius-editable p { margin: 0 0 0.5em 0; }
.nodius-editable h1 { font-size: 2em; margin: 0 0 0.5em 0; }
.nodius-editable h2 { font-size: 1.5em; margin: 0 0 0.5em 0; }
.nodius-editable h3 { font-size: 1.17em; margin: 0 0 0.5em 0; }
.nodius-editable ol, .nodius-editable ul { margin: 0 0 0.5em 1.5em; padding: 0; }
.nodius-editable li { margin: 0 0 0.25em 0; }
.nodius-editable img { max-width: 100%; height: auto; display: block; margin: 8px 0; }
`;

function injectBaseStyles(): void {
  if (document.querySelector('style[data-nodius-base]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-nodius-base', '');
  style.textContent = BASE_CSS;
  document.head.appendChild(style);
}

export const baseStylesPlugin: PluginDefinition = {
  name: 'base-styles',

  init() {
    injectBaseStyles();
    return { destroy() {} };
  },
};
