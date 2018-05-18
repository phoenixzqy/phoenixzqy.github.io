### add highlight.js to marked.js code renderer

`Marked.js` only render markdown into html(and other formats), left the `code` block with single color. If you want to colorize your `code` block in your app, here is a solution.

Solution:

```js
import marked, { Renderer } from 'marked';
import highlightjs from 'highlight.js';

// Create your custom renderer.
const renderer = new Renderer();
renderer.code = (code, language) => {
  // Check whether the given language is valid for highlight.js.
  const validLang = !!(language && highlightjs.getLanguage(language));
  // Highlight only if the language is valid.
  const highlighted = validLang ? highlightjs.highlight(language, code).value : code;
  // Render the highlighted code with `hljs` class.
  return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
};

// Set the renderer to marked.
marked.setOptions({ renderer });
```
----

or browser users (if you include marked.js and highlight.js from browser):

```js
const renderer = new marked.Renderer();
    renderer.code = (code, language) => {
      // Check whether the given language is valid for highlight.js.
      const validLang = !!(language && hljs.getLanguage(language));
      // Highlight only if the language is valid.
      const highlighted = validLang
        ? hljs.highlight(language, code).value
        : code;
      // Render the highlighted code with `hljs` class.
      return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
    };
    // Set the renderer to marked.
    marked.setOptions({ renderer });
```