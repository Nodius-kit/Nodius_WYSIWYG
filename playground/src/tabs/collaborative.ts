import {
  createEditor,
  createHistoryPlugin,
  boldPlugin,
  italicPlugin,
  underlinePlugin,
  headingPlugin,
  toolbarPlugin,
  createHtmlViewPlugin,
  createLinkPlugin,
  paragraphNodeType,
  MemoryTransport,
  BatchedTransport,
  generateDelta,
  type CoreEditor,
  type NodeTypeSpec,
  type MarkTypeSpec,
} from '@nodius/editor';

let editorA: CoreEditor | null = null;
let editorB: CoreEditor | null = null;
let unsubA: (() => void) | null = null;
let unsubB: (() => void) | null = null;

export function mount(container: HTMLElement): void {
  container.innerHTML = `
    <div class="panel">
      <h2>Collaboration Demo</h2>
      <p style="color:#64748b;font-size:0.8125rem;margin-bottom:1rem;">
        Two editors connected via MemoryTransport. Edits in one sync to the other
        with OT-based conflict resolution.
      </p>
    </div>
    <div class="collab-editors">
      <div class="editor-panel client-a">
        <h2>Client A (Alice)</h2>
        <div id="collab-editor-a"></div>
      </div>
      <div class="editor-panel client-b">
        <h2>Client B (Bob)</h2>
        <div id="collab-editor-b"></div>
      </div>
    </div>
    <div class="collab-log" id="collab-log"></div>
  `;

  const logEl = document.getElementById('collab-log')!;
  function addLog(msg: string) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // Linked transports with batching
  const [rawA, rawB] = MemoryTransport.createPair();
  const transportA = new BatchedTransport(rawA, { flushInterval: 200, maxBatchSize: 30 });
  const transportB = new BatchedTransport(rawB, { flushInterval: 200, maxBatchSize: 30 });
  transportA.connect();
  transportB.connect();

  const { plugin: histA } = createHistoryPlugin();
  const { plugin: histB } = createHistoryPlugin();
  const linkPluginA = createLinkPlugin();
  const linkPluginB = createLinkPlugin();

  // Collect specs for HTML view plugin
  const nodeTypes: NodeTypeSpec[] = [paragraphNodeType, ...headingPlugin.nodeTypes!];
  const markTypes: MarkTypeSpec[] = [
    ...boldPlugin.markTypes!,
    ...italicPlugin.markTypes!,
    ...underlinePlugin.markTypes!,
    ...linkPluginA.markTypes!,
  ];
  const { plugin: htmlViewA } = createHtmlViewPlugin({ nodeTypes, markTypes });
  const { plugin: htmlViewB } = createHtmlViewPlugin({ nodeTypes, markTypes });

  const toolbarLayout = [
    'bold', 'italic', 'underline',
    '|',
    'link',
    '|',
    'heading-1', 'heading-2', 'heading-3',
    '|',
    'html-view',
  ];

  editorA = createEditor({
    plugins: [boldPlugin, italicPlugin, underlinePlugin, headingPlugin, linkPluginA, htmlViewA, toolbarPlugin, histA],
    toolbar: toolbarLayout,
  });
  editorB = createEditor({
    plugins: [boldPlugin, italicPlugin, underlinePlugin, headingPlugin, linkPluginB, htmlViewB, toolbarPlugin, histB],
    toolbar: toolbarLayout,
  });

  editorA.mount(document.getElementById('collab-editor-a')!);
  editorB.mount(document.getElementById('collab-editor-b')!);

  addLog('Both editors initialized and connected.');

  // Sync A → B
  let prevDocA = editorA.getState().doc;
  let prevDocB = editorB.getState().doc;
  let applyingRemote = false;

  unsubA = editorA.on('state:change', ({ nextState }) => {
    if (applyingRemote) {
      prevDocA = nextState.doc;
      return;
    }
    const delta = generateDelta(prevDocA, nextState.doc, 'client-a');
    prevDocA = nextState.doc;
    if (delta.operations.length > 0) {
      addLog(`Client A: ${delta.operations.length} op(s) → sending to B`);
      transportA.send(delta);
    }
  });

  unsubB = editorB.on('state:change', ({ nextState }) => {
    if (applyingRemote) {
      prevDocB = nextState.doc;
      return;
    }
    const delta = generateDelta(prevDocB, nextState.doc, 'client-b');
    prevDocB = nextState.doc;
    if (delta.operations.length > 0) {
      addLog(`Client B: ${delta.operations.length} op(s) → sending to A`);
      transportB.send(delta);
    }
  });

  // Receive deltas
  transportA.onReceive((delta) => {
    if (applyingRemote) return;
    applyingRemote = true;
    addLog(`Client A received ${delta.operations.length} op(s) from B`);
    editorA!.dispatch({
      operations: delta.operations as any,
      origin: 'remote',
      timestamp: delta.timestamp,
    });
    prevDocA = editorA!.getState().doc;
    applyingRemote = false;
  });

  transportB.onReceive((delta) => {
    if (applyingRemote) return;
    applyingRemote = true;
    addLog(`Client B received ${delta.operations.length} op(s) from A`);
    editorB!.dispatch({
      operations: delta.operations as any,
      origin: 'remote',
      timestamp: delta.timestamp,
    });
    prevDocB = editorB!.getState().doc;
    applyingRemote = false;
  });

  addLog('Collaboration sync active. Type in either editor!');
}

export function destroy(): void {
  unsubA?.();
  unsubB?.();
  unsubA = null;
  unsubB = null;
  editorA?.destroy();
  editorB?.destroy();
  editorA = null;
  editorB = null;
}
