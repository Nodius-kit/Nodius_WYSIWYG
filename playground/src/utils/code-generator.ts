interface PluginEntry {
  id: string;
  importName: string;
  isFactory: boolean;
  factoryCall?: string;
  destructure?: string;
}

export function generateCode(
  plugins: PluginEntry[],
  toolbar: string[],
): string {
  // Collect imports
  const imports: string[] = ['createEditor'];
  const bodyLines: string[] = [];
  const pluginRefs: string[] = [];

  for (const p of plugins) {
    imports.push(p.importName);

    if (p.isFactory) {
      const varName = p.destructure
        ? p.destructure
        : p.id + 'Plugin';
      bodyLines.push(
        `const ${varName} = ${p.factoryCall ?? p.importName + '()'};`,
      );
      // Determine the reference name used in plugins array
      if (p.destructure) {
        // e.g. "{ plugin: historyPlugin }" → use "historyPlugin"
        const match = p.destructure.match(/plugin:\s*(\w+)/);
        pluginRefs.push(match ? match[1] : p.id + 'Plugin');
      } else {
        pluginRefs.push(p.id + 'Plugin');
      }
    } else {
      pluginRefs.push(p.importName);
    }
  }

  const importLine = `import {\n  ${imports.join(',\n  ')},\n} from '@nodius/editor';`;

  const body = bodyLines.length > 0 ? '\n' + bodyLines.join('\n') + '\n' : '';

  const toolbarStr = toolbar
    .map((t) => `'${t}'`)
    .join(', ');

  const pluginsStr = pluginRefs
    .map((r) => `    ${r},`)
    .join('\n');

  return `${importLine}
${body}
const editor = createEditor({
  plugins: [
${pluginsStr}
  ],
  toolbar: [${toolbarStr}],
});

editor.mount(document.getElementById('editor'));
`;
}
