# Vuelix Note

This a Markdown Note Web App powered by Vue.js and Vuetify hosted on Github pages.

## Idea

We use Github Pages as a static host and database service. Our web app will retrieve all markdown notes under certain directory.
The app is only for reading. You can take advantage to use Github to sync public notes, and use any of your favorite Text/Markdown editor to edit your notes.

## TODO

* APP:
  * ~~build app structure~~
  * ~~tree view~~
    * Search by title/tags?/content?
    * ~~fold all/unfold all~~
  * ~~markdown render~~
  * ~~Basic UI~~
  * ~~fix ul,li indentation bug~~
  * ~~add note slug to url (for sharing purpose)~~
  * ~~Most recent notes (use vuetify bottom navigation)~~
  * Mobile friendly
  * ~~Make the re-sizable(vertical & horizontal ) panel as a reusable component~~
  * Markdown
    * PPT mode
    * export/download as html/md/pdf
    * ~~syntax highlight (highlight.js)~~
    * create a note index based on `<h2/>` and `<h3/>`
  * Change themes?
    * load custom background theme for single note
* Public Notes:
  * ~~public notes structure~~
  * ~~public notes index generator tool~~
  * edit notes online?
    * Maybe integrate with github web hook? But I think it is not necessary.
* Private Notes:
  * Google Drive support
    * Login
    * retrieve notes folder
    * generate notes index
    * render notes
    * Markdown online editor
  * dropbox support
  * one drive support
