<template>
<div>
  <!-- Search -->
    <v-layout style="padding: 0 10px 0 20px;">
      <v-flex>
        <v-text-field
            v-model="search"
            append-icon="search"
            name="search"
            solo
            color="orange darken-4"
            label="search"></v-text-field>
      </v-flex>
    </v-layout>
  <!-- List -->
  <v-list two-line dense class="note-list">
    <div 
      v-for="(file, index) in files" 
      :key="index" >
      <v-list-tile 
      v-if="file.show"
      avatar 
      :class="{active: activeIndex === index}"
      @click="loadNote(file, index)">
        <v-list-tile-avatar>
          <v-icon>insert_drive_file</v-icon>
        </v-list-tile-avatar>
        <v-list-tile-content>
          <v-list-tile-title class="subheading"><span v-html="file.display_name"></span></v-list-tile-title>
          <v-list-tile-sub-title><span v-html="getFileDetailes(file)"></span></v-list-tile-sub-title>
        </v-list-tile-content>
      </v-list-tile>
    </div>
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
      files: [],
      search: ""
    };
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
      return `Updated at: ${updatedAt.toLocaleDateString(
        "zh"
      )}&nbsp;&nbsp;[ ${size} kb ]`;
    }
  },
  mounted() {
    // initial files
    var files = [];
    var getFiles = function(folder) {
      if (!folder) return;
      files = files.concat(folder.files);
      for (var i in folder.directories) {
        getFiles(folder.directories[i]);
      }
    };
    getFiles(data);
    files = files.map(file => {
      file.show = true;
      file.display_name = helpers.getFileName(file.file_name);
      return file;
    });
    files.sort((a, b) => {
      var d1 = new Date(a.updated_at),
        d2 = new Date(b.updated_at);
      if (d1 == d2) return 0;
      if (d1 < d2) return 1;
      return -1;
    });
    this.files = files;

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
  },
  watch: {
    search: function(newVal, OldVal) {
      newVal = newVal.toLowerCase();
      if (newVal) {
        this.files = this.files.map(file => {
          var index = helpers
            .getFileName(file.file_name)
            .toLowerCase()
            .indexOf(newVal);
          if (index < 0) {
            file.show = false;
          } else {
            file.show = true;
            var display_name = helpers.getFileName(file.file_name);
            var pattern = display_name.substr(index, newVal.length);
            file.display_name = display_name.replace(pattern, `<span style="color: #ffc107;">${pattern}</span>`);
          }
          return file;
        });
      } else {
        this.files = this.files.map(file => {
          file.show = true;
          file.display_name = helpers.getFileName(file.file_name);
          return file;
        });
      }
    }
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
