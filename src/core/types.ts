// ─── Node IDs ────────────────────────────────────────────────

export type NodeId = string;

let idCounter = 0;

export function generateId(): NodeId {
  idCounter++;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
  }
  // Fallback for test environments
  return `id_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

// ─── Marks (inline formatting) ───────────────────────────────

export interface Mark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

// ─── Node Types ──────────────────────────────────────────────

export interface TextNode {
  readonly id: NodeId;
  readonly kind: 'text';
  readonly text: string;
  readonly marks: readonly Mark[];
}

export interface ElementNode {
  readonly id: NodeId;
  readonly kind: 'element';
  readonly type: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly children: readonly EditorNode[];
}

export type EditorNode = TextNode | ElementNode;

// ─── Document ────────────────────────────────────────────────

export interface Document {
  readonly id: NodeId;
  readonly kind: 'document';
  readonly children: readonly ElementNode[];
  readonly version: number;
}

// ─── Selection ───────────────────────────────────────────────

export interface Position {
  readonly blockIndex: number;
  readonly path: readonly number[];
  readonly offset: number;
}

export interface EditorSelection {
  readonly anchor: Position;
  readonly focus: Position;
}

// ─── Content State ───────────────────────────────────────────

export interface ContentState {
  readonly doc: Document;
  readonly selection: EditorSelection | null;
}

// ─── Operations ──────────────────────────────────────────────

export type OperationType =
  | 'insert_text'
  | 'delete_text'
  | 'insert_node'
  | 'delete_node'
  | 'set_node_type'
  | 'update_attrs'
  | 'add_mark'
  | 'remove_mark'
  | 'wrap_node'
  | 'lift_node'
  | 'move_node'
  | 'split_node'
  | 'merge_nodes';

export interface Operation {
  readonly type: OperationType;
  readonly path: readonly number[];
  readonly offset?: number;
  readonly length?: number;
  readonly data?: unknown;
  readonly mark?: Mark;
  readonly nodeType?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly targetPath?: readonly number[];
}

export interface Transaction {
  readonly operations: readonly Operation[];
  readonly selection?: EditorSelection | null;
  readonly origin: string;
  readonly timestamp: number;
  readonly doc?: Document;
}

// ─── Commands ────────────────────────────────────────────────

export type CommandFn = (editor: EditorInterface, args?: Record<string, unknown>) => boolean;

export interface CommandRegistryInterface {
  register(name: string, fn: CommandFn): void;
  execute(name: string, args?: Record<string, unknown>): boolean;
  has(name: string): boolean;
  getAll(): ReadonlyMap<string, CommandFn>;
}

// ─── Keymap ──────────────────────────────────────────────────

export interface KeymapRegistryInterface {
  register(shortcut: string, commandName: string): void;
  unregister(shortcut: string): void;
  handleKeyDown(event: KeyboardEvent): boolean;
  getAll(): ReadonlyMap<string, string>;
}

// ─── Events ──────────────────────────────────────────────────

export interface EditorEvents {
  'state:change': { prevState: ContentState; nextState: ContentState };
  'selection:change': { selection: EditorSelection | null };
  'command:execute': { name: string; args?: Record<string, unknown> };
  'plugin:init': { name: string };
  'plugin:destroy': { name: string };
  'mount': undefined;
  'focus': undefined;
  'blur': undefined;
  'destroy': undefined;
}

export interface EventBusInterface {
  on<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): () => void;
  off<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): void;
  emit<K extends keyof EditorEvents>(event: K, data: EditorEvents[K]): void;
  destroy(): void;
}

// ─── Schema ──────────────────────────────────────────────────

export type DOMOutputSpec = string | [string, Record<string, string>?, ...(DOMOutputSpec | 0)[]];

export interface ParseRule {
  readonly tag?: string;
  readonly style?: string;
  readonly getAttrs?: (dom: HTMLElement) => Record<string, unknown> | false;
}

export interface NodeTypeSpec {
  readonly name: string;
  readonly group: 'block' | 'inline' | 'void';
  readonly content?: string;
  readonly attrs?: Record<string, { default: unknown }>;
  readonly toDOM: (node: ElementNode) => DOMOutputSpec;
  readonly parseDOM?: readonly ParseRule[];
}

export interface MarkTypeSpec {
  readonly name: string;
  readonly attrs?: Record<string, { default: unknown }>;
  readonly toDOM: (mark: Mark) => DOMOutputSpec;
  readonly parseDOM?: readonly ParseRule[];
}

// ─── Toolbar ─────────────────────────────────────────────────

export interface ToolbarItemSpec {
  readonly name: string;
  readonly icon: string;
  readonly title: string;
  readonly command: string;
  readonly commandArgs?: Record<string, unknown>;
  readonly isActive?: (state: ContentState) => boolean;
  readonly isDisabled?: (state: ContentState) => boolean;
  readonly group?: string;
  readonly order?: number;
}

// ─── Plugin ──────────────────────────────────────────────────

export interface PluginContext {
  readonly editor: EditorInterface;
  readonly commands: CommandRegistryInterface;
  readonly keymap: KeymapRegistryInterface;
}

export interface PluginInstance {
  destroy(): void;
}

export interface PluginDefinition {
  readonly name: string;
  readonly dependencies?: readonly string[];

  init?(ctx: PluginContext): void | PluginInstance;
  destroy?(): void;

  onTransaction?(tr: Transaction, state: ContentState): Transaction | null | undefined;
  onUpdate?(prevState: ContentState, nextState: ContentState): void;
  onKeyDown?(event: KeyboardEvent, ctx: PluginContext): boolean;

  nodeTypes?: readonly NodeTypeSpec[];
  markTypes?: readonly MarkTypeSpec[];
  toolbarItems?: readonly ToolbarItemSpec[];
}

// ─── Editor Interface ────────────────────────────────────────

export interface EditorConfig {
  plugins?: PluginDefinition[];
  initialContent?: Document;
  readOnly?: boolean;
  placeholder?: string;
  toolbar?: string[];
}

export interface EditorInterface {
  getState(): ContentState;
  getDoc(): Document;
  getSelection(): EditorSelection | null;
  dispatch(tr: Transaction): void;
  applyOperations(ops: Operation[], origin?: string): void;
  executeCommand(name: string, args?: Record<string, unknown>): boolean;
  on<K extends keyof EditorEvents>(event: K, handler: (data: EditorEvents[K]) => void): () => void;
  mount(container: HTMLElement): void;
  destroy(): void;
  getEditableElement(): HTMLElement | null;
  getRootElement(): HTMLElement | null;
}

// ─── Collaboration ───────────────────────────────────────────

export interface Delta {
  readonly operations: readonly Operation[];
  readonly baseVersion: number;
  readonly resultVersion: number;
  readonly clientId: string;
  readonly timestamp: number;
}

export interface CursorInfo {
  readonly clientId: string;
  readonly displayName: string;
  readonly color: string;
  readonly position: Position;
  readonly selection?: EditorSelection;
}

export interface TransportAdapter {
  send(delta: Delta): void;
  onReceive(callback: (delta: Delta) => void): void;
  onCursorUpdate(callback: (cursor: CursorInfo) => void): void;
  sendCursor(cursor: CursorInfo): void;
  connect(): void;
  disconnect(): void;
}

// ─── Helpers ─────────────────────────────────────────────────

export function createTextNode(text: string, marks: readonly Mark[] = []): TextNode {
  return { id: generateId(), kind: 'text', text, marks };
}

export function createElement(
  type: string,
  attrs: Record<string, unknown> = {},
  children: EditorNode[] = [],
): ElementNode {
  return { id: generateId(), kind: 'element', type, attrs, children };
}

export function createParagraph(text: string = '', marks: readonly Mark[] = []): ElementNode {
  const children: EditorNode[] = text ? [createTextNode(text, marks)] : [];
  return createElement('paragraph', {}, children);
}

export function isTextNode(node: EditorNode): node is TextNode {
  return node.kind === 'text';
}

export function isElementNode(node: EditorNode): node is ElementNode {
  return node.kind === 'element';
}
