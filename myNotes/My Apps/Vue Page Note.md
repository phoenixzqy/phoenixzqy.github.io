# Vuelix Note

This a Markdown Note Web App powered by Vue.js and Vuetify hosted on Github pages.

## Idea

We use Github Pages as a static host and database service. Our web app will retrieve all markdown notes under certain directory.
The app is only for reading. You can take advantage to use Github to sync public notes, and use any of your favorite Text/Markdown editor to edit your notes.

## TODO

* APP:
  * ~~build app structure~~
  * ~~tree view~~
    * Search/filter by fileName/tags?
      * Search in Most Recent Notes only, lets make it easy!
      * ~~Filter by file fileName~~
    * ~~fold all/unfold all~~
  * ~~markdown render~~
  * ~~Basic UI~~
  * ~~fix ul,li indentation bug~~
  * ~~add note slug to url (for sharing purpose)~~
  * ~~Most recent notes (use vuetify bottom navigation)~~
  * ~~Highlight folder/parent folders and both `notes` and `recent notes` when any note is selected~~
  * Mobile friendly
  * ~~Make the re-sizable(vertical & horizontal ) panel as a reusable component~~
  * Markdown
    * PPT mode
    * export/download as html/md/pdf
    * ~~syntax highlight (highlight.js)~~
    * create a note category based on `<h2/>` and `<h3/>`
  * Change themes?
    * load custom background theme for single note
* Public Notes:
  * ~~public notes structure~~
  * ~~public notes index generator tool~~
  * edit notes online?
    * Maybe integrate with github api.
      * This is doable with Github non-web application auth flow.
        * [auth](https://developer.github.com/apps/building-oauth-apps/authorizing-oauth-apps/#non-web-application-flow)
        * [get and update a file of any repository](https://developer.github.com/v3/repos/contents/#update-a-file)
      * This app should NEVER keep user's auth data in any where in browser.
        * so ask user to type in password/token for every update.
* Private Notes:
  * Google Drive support
    * Login
    * retrieve notes folder
    * generate notes index
    * render notes
    * Markdown online editor
  * dropbox support
  * one drive support
