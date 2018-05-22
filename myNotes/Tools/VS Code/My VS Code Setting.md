# My VS Code Setting file

> Note: many settings are for plugins. Please install plugin before use this setting
> For example: for this setting "todohighlight.keywords", it is used by a plugin called "TODO Highlight"

```js
<!-- JSON -->
{
    "editor.fontFamily": "'Monaco','Menlo','DejaVu Sans Mono','Droid Sans Mono','monospace'",
    "editor.fontSize": 14,
    "files.autoSave": "afterDelay",
    "window.zoomLevel": 1,
    "editor.mouseWheelZoom": true,
    "editor.formatOnSave": true,
    "workbench.colorTheme": "One Dark Pro",
    "workbench.iconTheme": "material-icon-theme",
    "explorer.confirmDragAndDrop": false,
    "editor.renderWhitespace": "all",
    // Glob patterns that defines the files to search for. Only include files you need, DO NOT USE `{**/*.*}` for both permormance and avoiding binary files reason.
    "todohighlight.include": [
        "**/*.js",
        "**/*.jsx",
        "**/*.ts",
        "**/*.tsx",
        "**/*.html",
        "**/*.php",
        "**/*.css",
        "**/*.scss",
        "**/*.c"
    ],
    // Customize keywords and colors. Any css color identifier is valid.
    "todohighlight.keywords": [
        {
            "text": "REVIEW:",
            "color": "AQUA",
            "backgroundColor": "#444",
            "border": "1px solid AQUA",
            "borderRadius": "3px"
        },
        {
            "text": "DEBUG:",
            "color": "FUCHSIA",
            "backgroundColor": "#444",
            "border": "1px solid FUCHSIA",
            "borderRadius": "3px"
        },
        {
            "text": "NOTE:",
            "color": "ORANGE",
            "backgroundColor": "#444",
            "border": "1px solid ORANGE",
            "borderRadius": "3px"
        },
        {
            "text": "HACK:",
            "color": "WHITE",
            "backgroundColor": "#444",
            "border": "1px solid WHITE",
            "borderRadius": "3px"
        },
        {
            "text": "TODO:",
            "color": "GREEN",
            "border": "1px solid GREEN",
            "borderRadius": "3px", //NOTE: using borderRadius along with `border` or you will see nothing change
            "backgroundColor": "#222"
            //other styling properties goes here ... 
        }
    ],
    "cSpell.ignoreWords": [
        "fortinet",
        "fortweb",
        "zhao",
        "qiyu",
        "eexplode",
        "asnqr"
    ],
    "explorer.confirmDelete": false,
    "cSpell.userWords": [
        "FORTIPSSESSID",
        "Hiragino",
        "MGUI",
        "chartjs",
        "datasets",
        "htaccess",
        "mixins",
        "vuetify"
    ],
    "gitlens.advanced.messages": {
        "suppressShowKeyBindingsNotice": true
    },
    "gitlens.historyExplorer.enabled": true,
}

```