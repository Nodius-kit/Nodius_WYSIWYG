import type { PluginDefinition, PluginContext } from '../core/types';
import { toHTML } from '../core/export';
import { ICONS } from '../assets/icons';

export interface PdfExportConfig {
  exportFn?: (html: string) => Promise<Blob>;
  styles?: string;
  filename?: string;
}

const DEFAULT_PRINT_STYLES = `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  color: #1a1a1a;
}
p { margin: 0 0 0.5em 0; }
h1 { font-size: 2em; margin: 0 0 0.5em 0; }
h2 { font-size: 1.5em; margin: 0 0 0.5em 0; }
h3 { font-size: 1.17em; margin: 0 0 0.5em 0; }
ol, ul { margin: 0 0 0.5em 1.5em; padding: 0; }
li { margin: 0 0 0.25em 0; }
img { max-width: 100%; height: auto; }
blockquote { border-left: 3px solid #ddd; margin: 0.5em 0; padding: 0.5em 1em; color: #555; }
pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.9em; }
hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
mark { padding: 0.1em 0.2em; border-radius: 2px; }
`;

export function createPdfExportPlugin(config?: PdfExportConfig): PluginDefinition {
  const customStyles = config?.styles ?? '';

  function getHtml(ctx: PluginContext): string {
    const editor = ctx.editor as any;
    const schema = editor.getSchema();
    const doc = editor.getDoc();
    return toHTML(doc, {
      nodeTypes: schema.getAllNodeTypes(),
      markTypes: schema.getAllMarkTypes(),
    });
  }

  return {
    name: 'pdf-export',

    init(ctx: PluginContext) {
      ctx.commands.register('export-pdf', () => {
        const html = getHtml(ctx);

        if (config?.exportFn) {
          // Callback mode: let the consumer handle it
          config.exportFn(html).catch((err) => {
            console.error('[nodius] PDF export failed:', err);
          });
          return true;
        }

        // Native mode: use iframe + window.print()
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.top = '-9999px';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          iframe.remove();
          return false;
        }

        const title = config?.filename ?? 'document';
        iframeDoc.open();
        iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${DEFAULT_PRINT_STYLES}${customStyles}</style>
</head>
<body>${html}</body>
</html>`);
        iframeDoc.close();

        // Wait for content to render then print
        let printed = false;
        const doPrint = () => {
          if (printed) return;
          printed = true;
          iframe.contentWindow?.print();
          setTimeout(() => iframe.remove(), 1000);
        };

        iframe.onload = doPrint;
        // Fallback if onload doesn't fire (synchronous write)
        setTimeout(doPrint, 100);

        return true;
      });
    },

    toolbarItems: [{
      name: 'pdf-export',
      icon: ICONS.pdf,
      title: 'Export PDF',
      command: 'export-pdf',
      order: 100,
    }],
  };
}
