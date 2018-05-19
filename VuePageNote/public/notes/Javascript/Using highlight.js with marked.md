### Add highlight.js to marked.js code renderer

`Marked.js` only render markdown into html(and other formats), left the `code` block with single color. If you want to colorize your `code` block in your app, here is a solution.

Solution:

```javascript
import marked, { Renderer } from 'marked';
import highlightjs from 'highlight.js';

// Create your custom renderer.
const renderer = new Renderer();
// for <pre><code></code></pre> block
renderer.code = (code, language) => {
  // Check whether the given language is valid for highlight.js.
  var validLang = !!(language && highlightjs.getLanguage(language));
  // Highlight only if the language is valid.
  var highlighted = validLang ? highlightjs.highlight(language, code).value : code;
  // Render the highlighted code with `hljs` class.
  return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
};
// for <code></code> block
renderer.codespan = (code) => {
    return `<code 
    class="hljs" 
    style="
    display: inline-block;
    line-height: 1;
    padding: 3px 5px;
    margin-bottom: -3px;">${code}</code>`
}
// Set the renderer to marked.
marked.setOptions({ renderer });
```

For browser users (if you include marked.js and highlight.js from browser):
```js
// for <pre><code></code></pre> block
const renderer = new marked.Renderer();
renderer.code = (code, language) => {
  // Check whether the given language is valid for highlight.js.
  var validLang = !!(language && hljs.getLanguage(language));
  // Highlight only if the language is valid.
  var highlighted = validLang
    ? hljs.highlight(language, code).value
    : code;
  // Render the highlighted code with `hljs` class.
  return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
};
// for <code></code> block
renderer.codespan = (code) => {
    return `<code 
    class="hljs" 
    style="
    display: inline-block;
    line-height: 1;
    padding: 3px 5px;
    margin-bottom: -3px;">${code}</code>`
}
// Set the renderer to marked.
marked.setOptions({ renderer });
```