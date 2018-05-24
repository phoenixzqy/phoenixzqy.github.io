<template>
  <div class="note-container">
    <horizontalResizepanel width="250">
      <template slot="left-panel">
        <verticalResizepanel :height="getTreeViewHeight">
          <template slot="top-panel">
            <div class="tree-view">
              <div class="left-title">
                <h3>-- Tree View --</h3>
              </div>
              
              <!-- root node -->
              <ul style="margin-left: -70px;">
                <folder :folder="treeData" :fname="''"></folder>
              </ul>
            </div>

            <v-menu offset-x offset-y class="tree-menu">
              <v-btn slot="activator" absolute
              outline
              icon
              small
              class="elevation-20"><v-icon>more_vert</v-icon></v-btn>
              <v-list>
                <v-list-tile @click="fold">
                  <v-list-tile-title><v-icon>unfold_less</v-icon>Fold All</v-list-tile-title>
                </v-list-tile>
                <v-list-tile @click="unfold">
                  <v-list-tile-title><v-icon>unfold_more</v-icon>Unfold All</v-list-tile-title>
                </v-list-tile>
                
              </v-list>
            </v-menu>
          </template>
          <template slot="bottom-panel">
            <div class="most-rencent-notes">
              <div class="left-title">
                <h3>-- Most Recent Notes --</h3>
              </div>
              <mostRecentNote/>
            </div>
          </template>
        </verticalResizepanel>
      </template>
      <template slot="right-panel">
          <div class="md-air note-wrapper" v-if="noteContent" v-html="noteContent"></div>
      </template>
    </horizontalResizepanel>
  </div>
</template>

<script>
import folder from "./folder";
import mostRecentNote from "./most_recent_notes";
import horizontalResizepanel from "./../commons/horizontal_resize_panel";
import verticalResizepanel from "./../commons/vertical_rezise_panel";
import data from "../../../database/noteStructure.json";
import eventBus from "../../utils/eventBus.js";
import helpers from "../../utils/helpers.js";

const renderer = new marked.Renderer();
renderer.code = (code, language) => {
  // Check whether the given language is valid for highlight.js.
  var validLang = !!(language && hljs.getLanguage(language));
  // Highlight only if the language is valid.
  var highlighted = validLang ? hljs.highlight(language, code).value : code;
  // Render the highlighted code with `hljs` class.
  return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
};
renderer.codespan = code => {
  return `<code 
    class="hljs" 
    style="
    display: inline-block;
    line-height: 1;
    padding: 3px 5px;
    margin-bottom: -3px;">${code}</code>`;
};
// Set the renderer to marked.
marked.setOptions({ renderer });

export default {
  data: function() {
    return {
      treeData: data,
      noteContent: `<div style="text-align: center; color: #424242; margin-top: 25vh; user-select:none;">
      <h1>Powered by Vue.js + Vuetify</h1>
      <h4>Produced by Felix Zhao</h4>
      </div>`
    };
  },
  components: {
    folder,
    horizontalResizepanel,
    verticalResizepanel,
    mostRecentNote
  },
  computed: {
    getTreeViewHeight() {
      return (window.innerHeight - 64 - 36) / 2;
    }
  },
  methods: {
    loadNote(url) {
      axios
        .get(url)
        .then(response => {
          var mdContent = response.data;
          this.noteContent = marked(mdContent);
          window.history.pushState("", "", `?note=${btoa(url)}`); // git node url to current url as a params for sharing purpose
        })
        .catch(error => console.log(error));
    },
    fold() {
      eventBus.$emit("fold-all");
    },
    unfold() {
      eventBus.$emit("unfold-all");
    }
  },
  mounted() {
    // load initial note if available
    var currentParams = helpers.getCurrentParams();
    if (currentParams && currentParams.note) {
      try {
        this.loadNote(atob(currentParams.note));
      } catch (e) {
        console.log(e);
      }
    }
    // change note on selection
    eventBus.$on("file-selected", payload => {
      this.loadNote(payload.file.path);
    });
  }
};
</script>
<style lang="less">
.note-container {
  height: calc(~"100vh - 100px");
  width: 100%;
}
@media only screen and (max-width: 960px) {
  .note-container {
    height: calc(~"100vh - 84px");
  }
}
.tree-view,
.most-rencent-notes {
  height: calc(100% - 40px);
  overflow-y: auto;
  ul,
  li {
    list-style-type: none !important;
    font-size: 16px;
  }
  li {
    margin-left: 25px;
  }
  span {
    text-decoration: none;
    cursor: pointer;
  }
}
.tree-view {
  padding: 45px 0 0 35px;
  overflow: auto;
  height: 100%;
}
.most-rencent-notes {
  margin: 40px 0px 15px -10px;
}
.note-wrapper {
  max-width: 960px;
  margin: 0 auto;
  padding: 25px;
}
.left-title {
  display: block;
  position: absolute;
  padding: 5px 0px 5px 35px;
  top: 0;
  left: 0;
  width: 100%;
  background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAATklEQVQoU2NkYGAwZmBgOMuAACA+CKCIMSIpADGRNaEYgKwQ3WQUjTCF6CYhWw2WAynEpgjmIpg7jUlSiM0TWK2GWUOUZ7ApxggeogIcABHJFtftKVfJAAAAAElFTkSuQmCC);
  overflow-x: hidden;
  box-shadow: 0 2px 20px 0px black;
  -moz-box-shadow: 0 2px 20px 0px black;
  -webkit-box-shadow: 0 2px 20px 0px black;
  background-color: #222;
}
.tree-menu {
  position: absolute;
  bottom: 40px;
  right: 40px;
}
</style>

