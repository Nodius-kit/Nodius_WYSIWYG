import type { PluginDefinition, PluginContext, Mark, ContentState } from '../core/types';
import { ICONS } from '../assets/icons';
import { createModal } from '../ui/modal';

function hasMarkInSelection(state: ContentState, markType: string): boolean {
  if (!state.selection) return false;
  const { anchor, focus } = state.selection;
  if (anchor.blockIndex !== focus.blockIndex) return false;

  const block = state.doc.children[anchor.blockIndex];
  if (!block) return false;

  const from = Math.min(anchor.offset, focus.offset);
  const to = Math.max(anchor.offset, focus.offset);
  let charPos = 0;

  for (const child of block.children) {
    if (child.kind !== 'text') continue;
    const nodeStart = charPos;
    const nodeEnd = charPos + child.text.length;
    charPos = nodeEnd;

    // Check if this text node overlaps with selection
    if (nodeEnd > from && nodeStart < to) {
      if (child.marks.some((m) => m.type === markType)) {
        return true;
      }
    }
    // For collapsed cursor, check the node the cursor is in
    if (from === to && nodeStart <= from && nodeEnd > from) {
      if (child.marks.some((m) => m.type === markType)) {
        return true;
      }
    }
  }
  return false;
}

function getLinkAttrsAtCursor(state: ContentState): { href: string; title: string } | null {
  if (!state.selection) return null;
  const { anchor } = state.selection;
  const block = state.doc.children[anchor.blockIndex];
  if (!block) return null;

  let charPos = 0;
  for (const child of block.children) {
    if (child.kind !== 'text') continue;
    const nodeEnd = charPos + child.text.length;
    if (anchor.offset >= charPos && anchor.offset <= nodeEnd) {
      const linkMark = child.marks.find((m) => m.type === 'link');
      if (linkMark) {
        return {
          href: String(linkMark.attrs?.href ?? ''),
          title: String(linkMark.attrs?.title ?? ''),
        };
      }
    }
    charPos = nodeEnd;
  }
  return null;
}

export function createLinkPlugin(): PluginDefinition {
  return {
    name: 'link',

    markTypes: [{
      name: 'link',
      attrs: {
        href: { default: '' },
        title: { default: '' },
      },
      toDOM: (mark: Mark) => ['a', {
        href: String(mark.attrs?.href ?? ''),
        ...(mark.attrs?.title ? { title: String(mark.attrs.title) } : {}),
        rel: 'noopener noreferrer',
      }],
      parseDOM: [{
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href') ?? '',
          title: dom.getAttribute('title') ?? '',
        }),
      }],
    }],

    init(ctx: PluginContext) {
      ctx.commands.register('set-link', (editor) => {
        const state = editor.getState();
        if (!state.selection) return false;

        const { anchor, focus } = state.selection;
        if (anchor.blockIndex !== focus.blockIndex) return false;

        const from = Math.min(anchor.offset, focus.offset);
        const to = Math.max(anchor.offset, focus.offset);
        if (from === to) return false; // Need a selection to apply link

        const existing = getLinkAttrsAtCursor(state);

        createModal({
          title: existing ? 'Edit Link' : 'Insert Link',
          fields: [
            {
              name: 'href',
              label: 'URL',
              type: 'url',
              value: existing?.href ?? '',
              placeholder: 'https://example.com',
            },
            {
              name: 'title',
              label: 'Title (optional)',
              type: 'text',
              value: existing?.title ?? '',
              placeholder: 'Link title',
            },
          ],
          onSubmit: (values) => {
            if (!values.href) return;
            const mark: Mark = {
              type: 'link',
              attrs: { href: values.href, ...(values.title ? { title: values.title } : {}) },
            };
            // Remove existing link first, then add new one
            editor.dispatch({
              operations: [
                { type: 'remove_mark', path: [anchor.blockIndex], offset: from, length: to - from, mark: { type: 'link' } },
                { type: 'add_mark', path: [anchor.blockIndex], offset: from, length: to - from, mark },
              ],
              origin: 'command',
              timestamp: Date.now(),
            });
          },
        });
        return true;
      });

      ctx.commands.register('remove-link', (editor) => {
        const state = editor.getState();
        if (!state.selection) return false;

        const { anchor, focus } = state.selection;
        if (anchor.blockIndex !== focus.blockIndex) return false;

        const from = Math.min(anchor.offset, focus.offset);
        const to = Math.max(anchor.offset, focus.offset);
        if (from === to) return false;

        editor.dispatch({
          operations: [
            { type: 'remove_mark', path: [anchor.blockIndex], offset: from, length: to - from, mark: { type: 'link' } },
          ],
          origin: 'command',
          timestamp: Date.now(),
        });
        return true;
      });

      ctx.keymap.register('Mod-k', 'set-link');
    },

    toolbarItems: [
      {
        name: 'link',
        icon: ICONS.link,
        title: 'Insert Link (Ctrl+K)',
        command: 'set-link',
        isActive: (state) => hasMarkInSelection(state, 'link'),
        order: 25,
      },
    ],
  };
}
