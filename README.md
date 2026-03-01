# @nodius/editor

A plugin-based WYSIWYG editor framework for the web. Built with TypeScript strict mode, featuring OT-based real-time collaboration, a headless kernel architecture, and a rich plugin ecosystem.

## Features

- **Plugin-based architecture** — everything is a plugin (bold, lists, toolbar, history...)
- **Real-time collaboration** — OT-based conflict resolution with transport abstraction
- **Nodius ecosystem integration** — `InstructionTransport` bridges editor operations with `@nodius/utils` InstructionBuilder protocol
- **Headless kernel** — framework-agnostic core, mount to any DOM element
- **Immutable state** — structural sharing for efficient updates and undo/redo
- **Full TypeScript** — strict mode, exported types, declaration maps
- **Rich text formatting** — bold, italic, underline, strikethrough, subscript, superscript, highlight, text color
- **Block types** — paragraphs, headings (H1-H3), ordered/unordered lists, blockquote, code block, horizontal rule
- **Media support** — images (base64 & remote upload), resize, crop, drag reorder, floating toolbar
- **Links** — inline link mark with modal editor
- **Alignment** — left, center, right, justify
- **Toolbar** — static toolbar + floating selection toolbar with dropdown support
- **Export/Import** — HTML, Markdown, JSON formats
- **PDF export** — via iframe print or custom callback
- **Extensible** — create custom plugins with lifecycle hooks, commands, keymaps, and node/mark types

## Installation

```bash
npm install @nodius/editor
```

## Quick Start

```typescript
import {
  createEditor,
  createHistoryPlugin,
  baseStylesPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  headingPlugin,
  listsPlugin,
  toolbarPlugin,
} from '@nodius/editor';

// Create history plugin (factory pattern for stateful plugins)
const { plugin: historyPlugin } = createHistoryPlugin();

// Create the editor
const editor = createEditor({
  plugins: [
    baseStylesPlugin,
    boldPlugin,
    italicPlugin,
    underlinePlugin,
    headingPlugin,
    listsPlugin,
    toolbarPlugin,
    historyPlugin,
  ],
  toolbar: [
    'bold', 'italic', 'underline',
    '|',
    'heading-1', 'heading-2', 'heading-3',
    '|',
    'ordered-list', 'unordered-list',
  ],
  placeholder: 'Start typing...',
});

// Mount to a DOM element
editor.mount(document.getElementById('editor')!);

// Listen to changes
editor.on('state:change', ({ nextState }) => {
  console.log('Document updated:', nextState.doc);
});
```

## Full Plugin Setup

```typescript
import {
  createEditor,
  createHistoryPlugin,
  baseStylesPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  strikethroughPlugin,
  subscriptPlugin,
  superscriptPlugin,
  createHighlightPlugin,
  createTextColorPlugin,
  headingPlugin,
  listsPlugin,
  blockquotePlugin,
  codeBlockPlugin,
  horizontalRulePlugin,
  alignmentPlugin,
  createLinkPlugin,
  createImageBase64Plugin,
  createImageResizePlugin,
  createImageCropPlugin,
  createImageToolbarPlugin,
  createImageDragPlugin,
  createFloatingToolbarPlugin,
  createPdfExportPlugin,
  createHtmlViewPlugin,
  toolbarPlugin,
  paragraphNodeType,
} from '@nodius/editor';

const { plugin: historyPlugin } = createHistoryPlugin();
const linkPlugin = createLinkPlugin();
const highlightPlugin = createHighlightPlugin();
const textColorPlugin = createTextColorPlugin();
const pdfExportPlugin = createPdfExportPlugin();
const floatingToolbar = createFloatingToolbarPlugin();

const editor = createEditor({
  plugins: [
    baseStylesPlugin,
    // Text formatting
    boldPlugin, italicPlugin, underlinePlugin,
    strikethroughPlugin, subscriptPlugin, superscriptPlugin,
    highlightPlugin, textColorPlugin,
    linkPlugin,
    // Block types
    headingPlugin, listsPlugin,
    blockquotePlugin, codeBlockPlugin,
    horizontalRulePlugin, alignmentPlugin,
    // Media
    createImageBase64Plugin(),
    createImageResizePlugin(),
    createImageCropPlugin(),
    createImageToolbarPlugin(),
    createImageDragPlugin(),
    // Toolbars & UI
    floatingToolbar,
    toolbarPlugin,
    pdfExportPlugin,
    historyPlugin,
  ],
  toolbar: [
    'bold', 'italic', 'underline', 'strikethrough',
    '|',
    'subscript', 'superscript', 'highlight', 'text-color',
    '|',
    'link',
    '|',
    'heading-1', 'heading-2', 'heading-3',
    '|',
    'blockquote', 'code-block', 'horizontal-rule',
    '|',
    'ordered-list', 'unordered-list',
    '|',
    'align-left', 'align-center', 'align-right', 'align-justify',
    '|',
    'image',
    '|',
    'pdf-export', 'html-view',
  ],
});

editor.mount(document.getElementById('editor')!);
```

## API Reference

### `createEditor(config?)`

Creates a new editor instance.

```typescript
interface EditorConfig {
  plugins?: PluginDefinition[];    // Plugins to register
  initialContent?: Document;       // Initial document tree
  readOnly?: boolean;              // Read-only mode
  placeholder?: string;            // Placeholder text
  toolbar?: string[];              // Toolbar layout (command names + '|' separators)
}
```

### Editor Instance

```typescript
// State access
editor.getState()       // → ContentState { doc, selection, storedMarks }
editor.getDoc()         // → Document
editor.getSelection()   // → EditorSelection | null

// Mutations
editor.dispatch(tr)             // Dispatch a transaction
editor.applyOperations(ops)     // Apply operations directly
editor.executeCommand(name)     // Execute a registered command

// Lifecycle
editor.mount(container)         // Mount to DOM element
editor.destroy()                // Cleanup and unmount

// Events
editor.on('state:change', ({ prevState, nextState }) => { ... })
editor.on('selection:change', ({ selection }) => { ... })
editor.on('command:execute', ({ name, args }) => { ... })
editor.on('mount', () => { ... })
editor.on('focus', () => { ... })
editor.on('blur', () => { ... })
editor.on('destroy', () => { ... })
```

### Export / Import

```typescript
import { toHTML, toMarkdown, toJSON, fromHTML, fromJSON } from '@nodius/editor';

// Export
const html = toHTML(editor.getDoc(), nodeTypes, markTypes);
const markdown = toMarkdown(editor.getDoc(), nodeTypes, markTypes);
const json = toJSON(editor.getDoc());

// Import
const doc = fromHTML(htmlString);
const doc = fromJSON(jsonString);
```

## Collaboration

NodiusEditor supports real-time collaboration via OT (Operational Transformation). You provide the transport layer (WebSocket, WebRTC, etc.) by implementing the `TransportAdapter` interface.

### Transport Interface

```typescript
interface TransportAdapter {
  send(delta: Delta): void;
  onReceive(callback: (delta: Delta) => void): void;
  onCursorUpdate(callback: (cursor: CursorInfo) => void): void;
  sendCursor(cursor: CursorInfo): void;
  connect(): void;
  disconnect(): void;
}
```

### WebSocket Example

```typescript
import {
  createEditor,
  BatchedTransport,
  InstructionTransport,
  generateDelta,
  type TransportAdapter,
  type Delta,
  type CursorInfo,
} from '@nodius/editor';

class WebSocketTransport implements TransportAdapter {
  private ws: WebSocket | null = null;
  private receiveCallback: ((delta: Delta) => void) | null = null;
  private cursorCallback: ((cursor: CursorInfo) => void) | null = null;

  constructor(private url: string) {}

  send(delta: Delta) {
    this.ws?.send(JSON.stringify({ type: 'delta', data: delta }));
  }
  onReceive(cb: (delta: Delta) => void) { this.receiveCallback = cb; }
  onCursorUpdate(cb: (cursor: CursorInfo) => void) { this.cursorCallback = cb; }
  sendCursor(cursor: CursorInfo) {
    this.ws?.send(JSON.stringify({ type: 'cursor', data: cursor }));
  }
  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'delta') this.receiveCallback?.(msg.data);
      if (msg.type === 'cursor') this.cursorCallback?.(msg.data);
    };
  }
  disconnect() { this.ws?.close(); }
}

// Recommended stack: raw transport → InstructionTransport → BatchedTransport
const ws = new WebSocketTransport('ws://localhost:3000/room-123');
const instruction = new InstructionTransport(ws);
const transport = new BatchedTransport(instruction, {
  flushInterval: 200,  // ms between flushes
  maxBatchSize: 30,     // max ops per batch
});
transport.connect();

const editor = createEditor({ plugins: [/* ... */] });
editor.mount(container);

// Sync local changes
let prevDoc = editor.getDoc();
editor.on('state:change', ({ nextState }) => {
  const delta = generateDelta(prevDoc, nextState.doc, 'my-client-id');
  prevDoc = nextState.doc;
  if (delta.operations.length > 0) {
    transport.send(delta);
  }
});

// Apply remote changes
transport.onReceive((delta) => {
  editor.dispatch({
    operations: delta.operations,
    origin: 'remote',
    timestamp: delta.timestamp,
  });
});
```

### InstructionBuilder Transport

`InstructionTransport` is a transport decorator that converts editor operations to/from `@nodius/utils` `Instruction` objects on the wire. This enables interop with other Nodius services that use the InstructionBuilder protocol.

```typescript
import { InstructionTransport, BatchedTransport } from '@nodius/editor';

// Wrap any TransportAdapter — conversion is transparent
const raw = new WebSocketTransport(url);
const instruction = new InstructionTransport(raw);
const transport = new BatchedTransport(instruction, { flushInterval: 200 });
transport.connect();
```

**Operation mapping:**

| Editor Operation | Instruction OpType | Path |
|---|---|---|
| `insert_text` | `STR_INS (16)` | `children.N.children.M.text` |
| `delete_text` | `STR_REM (11)` | `children.N.children.M.text` |
| `insert_node` | `ARR_INS (4)` | `children` |
| `delete_node` | `ARR_REM_IDX (14)` | `children` |
| `set_node_type` | `SET (1)` | `children.N.type` |
| `update_attrs` | `DICT_MERGE (15)` | `children.N.attrs` |
| `move_node` | `ARR_MOVE (17)` | `children` |
| `add_mark` / `remove_mark` | `SET (1)` | `__mark` (virtual) |
| `wrap` / `lift` / `split` / `merge` | `SET (1)` | `__structural` (virtual) |

You can also use the conversion functions directly:

```typescript
import {
  operationToInstruction,
  instructionToOperation,
  deltaToInstructions,
  instructionsToDelta,
} from '@nodius/editor';

// Convert a full delta to instructions
const { instructions, meta } = deltaToInstructions(delta);

// Convert back
const delta = instructionsToDelta(instructions, meta);
```

### In-Memory Transport (for testing)

```typescript
import { MemoryTransport } from '@nodius/editor';

const [transportA, transportB] = MemoryTransport.createPair();
transportA.connect();
transportB.connect();
// Changes sent by A arrive at B, and vice versa
```

### Collaboration Server

A minimal collaboration server needs to:

1. **Receive deltas** from clients
2. **Transform** concurrent operations using `transform()`
3. **Broadcast** transformed operations to all other clients
4. **Track versions** to detect concurrency

```typescript
import { transform, type Delta, type Operation } from '@nodius/editor';

// Server-side: when receiving a delta from client
function handleClientDelta(clientDelta: Delta, serverOps: Operation[]) {
  // Transform client ops against server ops applied since client's baseVersion
  const { opA: transformedClient } = transform(
    clientDelta.operations,
    serverOps,
    'left', // server wins ties
  );

  // Apply transformedClient to server state
  // Broadcast transformedClient to all other clients
}
```

The OT engine handles:
- **Text vs text** — concurrent inserts/deletes with offset adjustment
- **Node vs node** — concurrent block inserts/deletes with index shifting
- **Text vs node** — block path adjustment when blocks are inserted/deleted
- **Mark vs text** — mark offset/length adjustment when text is inserted/deleted in the same block

See `examples/collab-backend.ts` for a full WebSocket server example.

## Creating Custom Plugins

```typescript
import type { PluginDefinition, PluginContext, Transaction, ContentState } from '@nodius/editor';

const myPlugin: PluginDefinition = {
  name: 'my-plugin',
  dependencies: ['base-styles'],  // Optional: ensures load order

  // Register custom node/mark types
  nodeTypes: [{
    name: 'my-block',
    group: 'block',
    toDOM: (node) => ['div', { class: 'my-block', 'data-type': 'my-block' }, 0],
    parseDOM: [{ tag: 'div.my-block' }],
  }],

  markTypes: [{
    name: 'my-mark',
    toDOM: (mark) => ['span', { class: 'my-mark' }],
    parseDOM: [{ tag: 'span.my-mark' }],
  }],

  // Toolbar button
  toolbarItems: [{
    name: 'my-action',
    icon: '<svg>...</svg>',
    title: 'My Action',
    command: 'my-command',
    isActive: (state) => false,
  }],

  // Lifecycle hooks
  init(ctx: PluginContext) {
    // Register commands
    ctx.commands.register('my-command', (state, dispatch) => {
      // ... apply operations
      return true;
    });

    // Register keybindings
    ctx.keymap.register('Mod-Shift-M', (event, ctx) => {
      ctx.commands.execute('my-command');
      return true;
    });

    return {
      destroy() { /* cleanup */ },
    };
  },

  // Intercept transactions (return Transaction to modify, null to reject, undefined to pass)
  onTransaction(tr: Transaction, state: ContentState) {
    return undefined; // pass through
  },

  // React to state changes
  onUpdate(prevState: ContentState, nextState: ContentState) {
    // side effects
  },

  // Handle keyboard events
  onKeyDown(event: KeyboardEvent, ctx: PluginContext) {
    return false; // not handled
  },
};
```

### Stateful Plugin Factory Pattern

For plugins that need external control methods:

```typescript
function createMyPlugin() {
  let internalState = {};

  const plugin: PluginDefinition = {
    name: 'my-stateful-plugin',
    init(ctx) { /* ... */ },
  };

  return {
    plugin,
    getInternalState: () => internalState,
    doSomething: () => { /* control method */ },
  };
}

// Usage
const { plugin, doSomething } = createMyPlugin();
const editor = createEditor({ plugins: [plugin] });
```

## Available Plugins

| Plugin | Import | Description |
|--------|--------|-------------|
| `baseStylesPlugin` | Direct | Base editor CSS (required by toolbar & floating toolbar) |
| `boldPlugin` | Direct | Bold formatting (`Ctrl+B`) |
| `italicPlugin` | Direct | Italic formatting (`Ctrl+I`) |
| `underlinePlugin` | Direct | Underline formatting (`Ctrl+U`) |
| `strikethroughPlugin` | Direct | Strikethrough formatting |
| `subscriptPlugin` | Direct | Subscript formatting |
| `superscriptPlugin` | Direct | Superscript formatting |
| `headingPlugin` | Direct | H1, H2, H3 block types |
| `listsPlugin` | Direct | Ordered and unordered lists |
| `blockquotePlugin` | Direct | Blockquote block type |
| `codeBlockPlugin` | Direct | Code block with monospace |
| `horizontalRulePlugin` | Direct | Horizontal rule (void block) |
| `alignmentPlugin` | Direct | Text alignment (left/center/right/justify) |
| `toolbarPlugin` | Direct | Static toolbar above editor |
| `createHistoryPlugin()` | Factory | Undo/redo with document snapshots |
| `createHighlightPlugin()` | Factory | Highlight mark with color picker |
| `createTextColorPlugin()` | Factory | Text color mark with color picker |
| `createLinkPlugin()` | Factory | Link mark with modal editor |
| `createFloatingToolbarPlugin()` | Factory | Floating toolbar on text selection |
| `createImageBase64Plugin()` | Factory | Image upload as base64 |
| `createImageRemotePlugin()` | Factory | Image upload to remote server |
| `createImageResizePlugin()` | Factory | Image resize handles |
| `createImageCropPlugin()` | Factory | Image cropping tool |
| `createImageToolbarPlugin()` | Factory | Floating image toolbar |
| `createImageDragPlugin()` | Factory | Drag images to reorder |
| `createHtmlViewPlugin()` | Factory | Toggle HTML source view |
| `createPdfExportPlugin()` | Factory | Export document to PDF |

## Document Model

The document is an immutable tree:

```
Document
  └── ElementNode[] (blocks: paragraph, heading, list, etc.)
        └── EditorNode[] (children: TextNode or nested ElementNode)
              └── TextNode { text, marks[] }
```

All nodes have a unique `id: NodeId` for efficient reconciliation.

### Operations

All state changes go through typed operations:

| Operation | Description |
|-----------|-------------|
| `insert_text` | Insert text at position |
| `delete_text` | Delete text range |
| `insert_node` | Insert a block node |
| `delete_node` | Delete a block node |
| `split_node` | Split a block at position |
| `merge_nodes` | Merge two adjacent blocks |
| `set_node_type` | Change block type (e.g. paragraph to heading) |
| `update_attrs` | Update block attributes |
| `add_mark` | Apply inline mark to text range |
| `remove_mark` | Remove inline mark from text range |
| `wrap_node` | Wrap block in container (e.g. list) |
| `lift_node` | Unwrap block from container |
| `move_node` | Move block to different position |

## Type Helpers

```typescript
import {
  createTextNode,
  createElement,
  createParagraph,
  isTextNode,
  isElementNode,
  generateId,
} from '@nodius/editor';

const text = createTextNode('Hello', [{ type: 'bold' }]);
const paragraph = createParagraph('Some text');
const heading = createElement('heading', { level: 1 }, [createTextNode('Title')]);
```

## Build & Development

```bash
npm run dev           # Vite dev server
npm run playground    # Interactive playground with demo tabs
npm run build         # Library build (ES + CJS) + type declarations
npm run typecheck     # Type-check without emit
npm test              # Run all tests (743+ tests, 57 files)
npm run test:watch    # Watch mode
npm run test:stress   # Stress tests only
```

## Dependencies

- **Runtime**: [`@nodius/utils`](https://github.com/Nodius-kit/Nodius) — InstructionBuilder for collaboration wire protocol
- **Dev only**: TypeScript, Vite, Vitest

## Browser Support

Works in all modern browsers supporting `contenteditable`, `beforeinput` events, and ES2022.

## License

MIT
