<template>
  <div id="app">
    <div class="header">

    </div>
    <div class="body">
      <div class="tree-view">
        <ul id="root">
          <folder :folder="treeData" :fname="''"></folder>
        </ul>
      </div>
      <div class="note">
        <div class="md-air" v-if="noteContent" v-html="noteContent">
        </div>
      </div>
    </div>
    <div class="footer">

    </div>
  </div>
</template>
<script>
import folder from "./folder";
import data from "../../database/noteStructure.json";
import eventBus from "../utils/eventBus.js";

export default {
  data: function() {
    return {
      treeData: data,
      noteContent: null
    };
  },
  components: {
    folder
  },
  mounted() {
    eventBus.$on("file-selected", payload => {
      var rootUrl = 'https://phoenixzqy.github.io'; // this is for testing purpose
      axios
        .get(rootUrl+ payload.url)
        .then(response => {
          var mdContent = response.data;
          this.noteContent = marked(mdContent);
        })
        .catch(error => console.log(error));
    });
  }
};
</script>