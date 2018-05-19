<template>
  <li>
    <span 
    :class="{folder_active: activeIndex >= 0}"
    @click="showNodes = !showNodes">
      <v-icon small outline  v-if="fname">{{showNodes ? 'folder_open' : 'folder'}}</v-icon> {{fname}}
    </span>
    <ul v-show="showNodes">
      <folder 
      v-for="(subFolder, index) in folder.directories" 
      :key="index"
      :folder="subFolder"
      :fname="index">
      </folder>
      <li v-for="(file, index) in folder.files" :key="index">
        <span 
        href="javascript:;" 
        :title="file.updated_at"
        @click="loadNote(file, index)"
        :class="{active: activeIndex === index}">
          <v-icon small outline>library_books</v-icon> {{file.file_name}}
        </span>
        </li>
    </ul>
  </li>
</template>
<script>
import eventBus from "../../utils/eventBus.js";
import helpers from "../../utils/helpers.js";

export default {
  props: {
    folder: Object,
    fname: Object
  },
  name: "folder", // this is very important for vue to register this component globally, so that we can recursively use it.
  data: function() {
    return {
      showNodes: false,
      activeIndex: -1
    };
  },
  methods: {
    loadNote(file, index) {
      eventBus.$emit("file-selected", {
        file: file
      });
    }
  },
  mounted() {
    if (!this.fname) this.showNodes = true; // show the root node
    // load initial note if available
    var currentParams = helpers.getCurrentParams();
    if (currentParams && currentParams.note && this.folder) {
      this.folder.files.forEach((file, index) => {
        if (file.path === atob(currentParams.note)) {
          this.activeIndex = index;
          this.showNodes = true;
        }
      });
    }

    // unselect all node.
    var that = this;
    eventBus.$on("file-selected", payload => {
      that.activeIndex = -1;
      that.folder.files.forEach((file, index) => {
        if (file.path === payload.file.path) that.activeIndex = index;
      });
    });

    // menu items
    eventBus.$on("fold-all", () => {
      if (that.fname) that.showNodes = false;
      
    });
    eventBus.$on("unfold-all", () => {
      that.showNodes = true;
    });
  }
};
</script>
<style lang="less" scoped>
.active {
  color: #fb5d00 !important;
}
.folder_active {
  color: #ff9b52 !important;
}
</style>

