// ─── Core ────────────────────────────────────────────────────
export { CoreEditor, createEditor } from './core/editor';
export { StateManager } from './core/state';
export { applyOperation, applyTransaction } from './core/operations';
export { EventBus } from './core/events';
export { CommandRegistry } from './core/commands';
export { KeymapRegistry } from './core/keymap';
export { PluginRegistry } from './core/plugin';
export { Schema, paragraphNodeType } from './core/schema';
export { Reconciler } from './core/reconciler';
export { SelectionManager } from './core/selection';
export { createHistoryPlugin } from './core/history';

// ─── Export / Import ─────────────────────────────────────────
export { toJSON, toHTML, toMarkdown } from './core/export';
export { fromJSON, fromHTML } from './core/import';

// ─── Types ───────────────────────────────────────────────────
export type {
  NodeId,
  Mark,
  TextNode,
  ElementNode,
  EditorNode,
  Document,
  Position,
  EditorSelection,
  ContentState,
  OperationType,
  Operation,
  Transaction,
  CommandFn,
  CommandRegistryInterface,
  KeymapRegistryInterface,
  EditorEvents,
  EventBusInterface,
  DOMOutputSpec,
  ParseRule,
  NodeTypeSpec,
  MarkTypeSpec,
  ToolbarItemSpec,
  PluginContext,
  PluginInstance,
  PluginDefinition,
  EditorConfig,
  EditorInterface,
  Delta,
  CursorInfo,
  TransportAdapter,
} from './core/types';

// ─── Type Helpers ────────────────────────────────────────────
export {
  generateId,
  createTextNode,
  createElement,
  createParagraph,
  isTextNode,
  isElementNode,
} from './core/types';

// ─── Standard Plugins ────────────────────────────────────────
export { boldPlugin } from './plugins/bold';
export { italicPlugin } from './plugins/italic';
export { underlinePlugin } from './plugins/underline';
export { headingPlugin } from './plugins/heading';
export { listsPlugin } from './plugins/lists';
export { toolbarPlugin } from './plugins/toolbar';
export { createImageBase64Plugin } from './plugins/image-base64';
export { createImageRemotePlugin } from './plugins/image-remote';
export { createImageResizePlugin } from './plugins/image-resize';
export { createImageCropPlugin } from './plugins/image-crop';
export { createHtmlViewPlugin } from './plugins/html-view';

// ─── Icons ───────────────────────────────────────────────────
export { ICONS } from './assets/icons';

// ─── Collaboration ──────────────────────────────────────────
export { generateDelta, applyDelta } from './collaboration/delta';
export { VersionVector } from './collaboration/version';
export { transform } from './collaboration/ot';
export { CursorSyncManager, mapPosition } from './collaboration/cursor-sync';
export { MemoryTransport } from './collaboration/transport';
