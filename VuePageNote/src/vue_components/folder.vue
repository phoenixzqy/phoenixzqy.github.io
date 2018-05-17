<template>
  <li>
    <div>
      {{fname}}
    </div>
    <ul>
      <folder 
      v-for="(subFolder, index) in folder.directories" 
      :key="index"
      :folder="subFolder"
      :fname="index">
      </folder>
      <li v-for="(file, index) in folder.files" :key="index">
        <a 
        href="javascript:;" 
        :title="file.updated_at"
        @click="loadNote(file.path)">{{file.file_name}}</a>
        </li>
    </ul>
  </li>
</template>
<script>
import eventBus from "../utils/eventBus.js";

export default {
  props: {
    folder: Object,
    fname: Object,
  },
  name: "folder", // this is very important for vue to register this component globally, so that we can recursively use it.
  data: function() {
    return {};
  },
  methods: {
    loadNote(url) {
      
      eventBus.$emit("file-selected", {
        url: url
      })
    }
  }
};
</script>