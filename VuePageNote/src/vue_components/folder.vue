<template>
  <li>
    <span 
    href="javascript:;" 
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
import eventBus from "../utils/eventBus.js";

export default {
  props: {
    folder: Object,
    fname: Object
  },
  name: "folder", // this is very important for vue to register this component globally, so that we can recursively use it.
  data: function() {
    return {
      showNodes: true,
      activeIndex: null
    };
  },
  methods: {
    loadNote(file, index) {
      eventBus.$emit("file-selected", {
        url: file.path
      });
      this.activeIndex = index;
    }
  },
  mounted() {
    var that = this;
    eventBus.$on("file-selected", function() {
      that.activeIndex = null;
    });
  }
};
</script>
<style lang="less" scoped>
.active {
  color: #fb5d00 !important;
}
</style>

