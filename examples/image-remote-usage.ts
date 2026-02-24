/**
 * Example: Remote image upload integration
 *
 * This example shows how to use createImageRemotePlugin with an external
 * upload server. When the user drops/pastes an image, the plugin calls
 * your uploadFn and inserts the resulting URL into the document.
 *
 * This file is NOT part of the library bundle — it's a usage example.
 */

import { createEditor, createImageRemotePlugin, createImageBase64Plugin, createImageToolbarPlugin, toolbarPlugin, boldPlugin, italicPlugin } from '../src/index';

// ─── Upload function ────────────────────────────────────────────

/**
 * Replace this with your actual upload endpoint.
 * The function receives a File and must return a Promise<string> with the URL.
 */
async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch('https://api.example.com/upload', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN_HERE',
    },
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  const { url } = await res.json();
  return url; // e.g. "https://cdn.example.com/images/abc123.jpg"
}

// ─── Editor setup ───────────────────────────────────────────────

const imagePlugin = createImageRemotePlugin({
  uploadFn: uploadImage,
});

const editor = createEditor({
  plugins: [
    boldPlugin,
    italicPlugin,
    imagePlugin,
    createImageBase64Plugin(),    // Fallback for base64 if needed
    createImageToolbarPlugin(),   // Image toolbar on click
    toolbarPlugin,
  ],
});

// Mount the editor
const container = document.getElementById('editor');
if (container) {
  editor.mount(container);
}

/**
 * Alternative: upload with progress tracking
 *
 * ```typescript
 * const imagePlugin = createImageRemotePlugin({
 *   uploadFn: async (file: File) => {
 *     return new Promise<string>((resolve, reject) => {
 *       const xhr = new XMLHttpRequest();
 *       const formData = new FormData();
 *       formData.append('image', file);
 *
 *       xhr.upload.onprogress = (e) => {
 *         if (e.lengthComputable) {
 *           const pct = Math.round((e.loaded / e.total) * 100);
 *           console.log(`Upload progress: ${pct}%`);
 *         }
 *       };
 *
 *       xhr.onload = () => {
 *         if (xhr.status >= 200 && xhr.status < 300) {
 *           const { url } = JSON.parse(xhr.responseText);
 *           resolve(url);
 *         } else {
 *           reject(new Error(`Upload failed: ${xhr.statusText}`));
 *         }
 *       };
 *
 *       xhr.onerror = () => reject(new Error('Upload network error'));
 *       xhr.open('POST', 'https://api.example.com/upload');
 *       xhr.send(formData);
 *     });
 *   },
 * });
 * ```
 */

export { editor };
