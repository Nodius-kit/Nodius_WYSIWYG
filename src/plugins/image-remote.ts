import type { PluginDefinition, PluginContext, ElementNode } from '../core/types';
import { generateId } from '../core/types';
import { ICONS } from '../assets/icons';

export interface ImageRemoteConfig {
  uploadFn: (file: File) => Promise<string>;
}

function createImageNode(src: string, alt: string = '', loading = false): ElementNode {
  return {
    id: generateId(),
    kind: 'element',
    type: 'image',
    attrs: { src, alt, ...(loading ? { loading: true } : {}) },
    children: [],
  };
}

export function createImageRemotePlugin(config: ImageRemoteConfig): PluginDefinition {
  return {
    name: 'image-remote',
    dependencies: ['image-base64'],

    init(ctx: PluginContext) {
      ctx.commands.register('insert-image-remote', (editor) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;

          const state = editor.getState();
          const blockIndex = state.selection?.anchor.blockIndex ?? state.doc.children.length - 1;

          // Insert placeholder
          const placeholderNode = createImageNode('', file.name, true);
          const placeholderId = placeholderNode.id;

          editor.dispatch({
            operations: [
              { type: 'insert_node', path: [], offset: blockIndex + 1, data: placeholderNode },
            ],
            origin: 'command',
            timestamp: Date.now(),
          });

          try {
            const url = await config.uploadFn(file);

            // Find the placeholder and update it
            const currentDoc = editor.getDoc();
            const placeholderIndex = currentDoc.children.findIndex((c) => c.id === placeholderId);
            if (placeholderIndex !== -1) {
              editor.dispatch({
                operations: [
                  { type: 'update_attrs', path: [placeholderIndex], attrs: { src: url, loading: undefined } },
                ],
                origin: 'command',
                timestamp: Date.now(),
              });
            }
          } catch (err) {
            // Remove placeholder on error
            const currentDoc = editor.getDoc();
            const placeholderIndex = currentDoc.children.findIndex((c) => c.id === placeholderId);
            if (placeholderIndex !== -1) {
              editor.dispatch({
                operations: [
                  { type: 'delete_node', path: [], offset: placeholderIndex },
                ],
                origin: 'command',
                timestamp: Date.now(),
              });
            }
          }
        };
        input.click();
        return true;
      });
    },

    toolbarItems: [{
      name: 'image-upload',
      icon: ICONS.image,
      title: 'Upload Image',
      command: 'insert-image-remote',
      order: 61,
    }],
  };
}
