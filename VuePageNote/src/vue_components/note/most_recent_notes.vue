<template>
<div>
  <!-- <ul class="note-list">
        <li v-for="(file, index) in getSortedFiles" :key="index">
            <span 
                href="javascript:;" 
                :title="file.updated_at"
                @click="loadNote(file, index)"
                :class="{active: activeIndex === index}">
                <v-icon small outline>library_books</v-icon> {{getFileName(file.file_name)}}
            </span>
        </li>
    </ul> -->
  <v-list two-line dense class="note-list">
    <v-list-tile 
    v-for="(file, index) in getSortedFiles" 
    :key="index" 
    avatar 
    :class="{active: activeIndex === index}"
    @click="loadNote(file, index)">
      <v-list-tile-avatar>
        <v-icon>insert_drive_file</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-content>
        <v-list-tile-title class="subheading">{{ getFileName(file.file_name) }}</v-list-tile-title>
        <v-list-tile-sub-title><span v-html="getFileDetailes(file)"></span></v-list-tile-sub-title>
      </v-list-tile-content>
    </v-list-tile>
  </v-list>
</div>
</template>
<script>
import data from "../../../database/noteStructure.json";
import eventBus from "../../utils/eventBus.js";
import helpers from "../../utils/helpers.js";

export default {
  data: function() {
    return {
      activeIndex: null,
      limit: 20,
      files: -1
    };
  },
  computed: {
    getSortedFiles() {
      var files = [];
      var getFiles = function(folder) {
        if (!folder) return;
        files = files.concat(folder.files);
        for (var i in folder.directories) {
          getFiles(folder.directories[i]);
        }
      };
      getFiles(data);
      files.sort((a, b) => {
        var d1 = new Date(a.updated_at),
          d2 = new Date(b.updated_at);
        if (d1 == d2) return 0;
        if (d1 < d2) return 1;
        return -1;
      });
      this.files = files;
      return files;
    }
  },
  methods: {
    loadNote(file, index) {
      eventBus.$emit("file-selected", {
        file: file
      });
    },
    getFileName(fileName) {
      return helpers.getFileName(fileName);
    },
    getFileDetailes(file) {
      var updatedAt = new Date(file.updated_at);
      var size = (file.size / 1024).toFixed(2);
      return `Updated at: ${updatedAt.toLocaleDateString("zh")}&nbsp;&nbsp;[ ${size} kb ]`;
    }
  },
  mounted() {
    // load initial note if available
    var currentParams = helpers.getCurrentParams();
    if (currentParams && currentParams.note && this.files) {
      this.files.forEach((file, index) => {
        if (file.path === atob(currentParams.note)) {
          this.activeIndex = index;
        }
      });
    }
    // unselect all node.
    var that = this;
    eventBus.$on("file-selected", payload => {
      that.activeIndex = -1;
      that.files.forEach((file, index) => {
        if (file.path === payload.file.path) that.activeIndex = index;
      });
    });
  }
};
</script>
<style lang="less" scoped>
.active {
  color: #fb5d00 !important;
  i {
    color: #fb5d00 !important;
  }
}
.list {
  background-color: transparent;
}
</style>
