<template>
    <div class="body" @mouseup="stopDrag"  @mousemove="doDrag">
        <div class="left-penal" :style="{width:treeViewWidth + 'px'}">
          <div class="tree-view">
            <!-- root node -->
            <ul style="margin-left: -70px;">
              <folder :folder="treeData" :fname="''"></folder>
            </ul>
          </div>
        </div>
        <div class="mid-bar" @mousedown="startDrag">
          <span class="vertical-bar"></span>
          <span class="vertical-bar"></span>
          <span class="vertical-bar"></span>
        </div>
        <div class="right-penal">
          <div class="md-air note-wrapper" v-if="noteContent" v-html="noteContent">
          </div>
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
      noteContent: `<div style="text-align: center; color: #424242; margin-top: 30%;">
      <h1>Powered by Vue.js + Vuetify</h1>
      <h4>Produced by Felix Zhao</h4>
      </div>`,
      treeViewWidth: 250,
    };
  },
  components: {
    folder
  },
  methods: {
    startDrag(event) {
      if (event.which === 1)
        // left mouse only
        this.dragging = true;
    },
    doDrag(event) {
      if (this.dragging) {
        this.treeViewWidth = event.screenX;
      }
    },
    stopDrag() {
      this.dragging = false;
    }
  },
  mounted() {
    eventBus.$on("file-selected", payload => {
      var rootUrl = "https://phoenixzqy.github.io"; // this is for testing purpose
      axios
        .get(rootUrl + payload.url)
        .then(response => {
          var mdContent = response.data;
          this.noteContent = marked(mdContent);
        })
        .catch(error => console.log(error));
    });
  }
};
</script>
<style lang="less">
.body {
  height: calc(~"100vh - 100px");
  width: 100%;
  box-sizing: border-box;
  position: relative;
  top: 0;
  left: 0;
  display: block;
  .left-penal,
  .mid-bar,
  .right-penal {
    position: relative;
    height: 100%;
    display: block;
  }
  .left-penal {
    float: left;
    overflow: auto;
    white-space: nowrap;
    background-color: #222;
  }
  .mid-bar {
    width: 10px;
    background-color: #424242;
    float: left;
    box-sizing: border-box;
    cursor: pointer;
    user-select: none;
    -moz-user-select: none;
    -khtml-user-select: none;
    -webkit-user-select: none;
    -o-user-select: none;
    position: relative;
    -webkit-box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3),
      0 0 40px rgba(0, 0, 0, 0.1) inset;
    -moz-box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3),
      0 0 40px rgba(0, 0, 0, 0.1) inset;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3), 0 0 40px rgba(0, 0, 0, 0.1) inset;
    &:before,
    &:after {
      content: "";
      position: absolute;
      z-index: -1;
      -webkit-box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
      -moz-box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
      top: 0;
      bottom: 0;
      left: 10px;
      right: 10px;
      -moz-border-radius: 100px / 10px;
      border-radius: 100px / 10px;
    }
    &:after {
      right: 10px;
      left: auto;
      -webkit-transform: skew(8deg) rotate(3deg);
      -moz-transform: skew(8deg) rotate(3deg);
      -ms-transform: skew(8deg) rotate(3deg);
      -o-transform: skew(8deg) rotate(3deg);
      transform: skew(8deg) rotate(3deg);
    }
    &:hover {
      background-color: #525252;
    }
    .vertical-bar {
      display: block;
      width: 2px;
      height: 20px;
      background-color: #757575;
      position: absolute;
      top: 50%;
      margin-top: -10px;
      border-radius: 5px;
      &:nth-child(1) {
        left: 1px;
      }
      &:nth-child(2) {
        left: 4px;
      }
      &:nth-child(3) {
        left: 7px;
      }
    }
  }
  .right-penal {
    margin-left: 200px;
    padding: 50px;
    overflow-y: auto;
    box-sizing: border-box;
    .note-wrapper {
      max-width: 960px;
      margin: 0 auto;
    }
  }
  .tree-view {
    margin: 20px 35px;
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
}
</style>

