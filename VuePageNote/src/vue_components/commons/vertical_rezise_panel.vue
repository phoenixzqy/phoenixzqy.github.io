<template>
    <div class="panel-container" @mouseup="stopDrag" @touchend="stopDrag" @mousemove="doDrag" @touchmove="doDrag">
        <div class="top-panel" :style="{height:topPanelHeight + 'px'}">
          <slot name="top-panel"></slot>
        </div>
        <div class="mid-bar" @mousedown="startDrag" @touchstart="startDrag">
          <span class="vertical-bar"></span>
          <span class="vertical-bar"></span>
          <span class="vertical-bar"></span>
        </div>
        <div class="bottom-panel" :style="{height:'calc( 100% - ' + (topPanelHeight + 20) + 'px' + ')'}">
          <slot name="bottom-panel"></slot>
        </div>
      </div>
</template>
<script>
export default {
  props: {
    height: Object
  },
  data: function() {
    return {
      topPanelHeight: 250,
      dragging: false,
      distance: null
    };
  },
  methods: {
    startDrag(event) {
      switch (event.constructor.name) {
        case "TouchEvent":
        this.distance = event.touches[0].clientY - this.topPanelHeight;
          this.dragging = true;
          break;
        case "MouseEvent":
          if (event.which === 1)
      this.distance = event.screenY - this.topPanelHeight;
            // left mouse only
            this.dragging = true;
          break;
      }
    },
    doDrag(event) {
      if (this.dragging) {
        switch (event.constructor.name) {
          case "TouchEvent":
            this.topPanelHeight = event.touches[0].clientY - this.distance;
            break;
          case "MouseEvent":
            this.topPanelHeight = event.screenY - this.distance;
            break;
        }
      }
    },
    stopDrag() {
      this.dragging = false;
    }
  },
  mounted() {
    if (typeof this.height !== "undefined") {
      this.topPanelHeight = this.height;
    }
  }
};
</script>
<style lang="less" scoped>
.panel-container {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  top: 0;
  left: 0;
  display: block;
  overflow: hidden;
  .top-panel,
  .mid-bar,
  .bottom-panel {
    position: relative;
    width: 100%;
    display: block;
    overflow: hidden;
  }
  .top-panel {
    float: left;
    white-space: nowrap;
    background-color: #222;
  }
  .mid-bar {
    width: 100%;
    height: 20px;
    background-color: #424242;
    float: left;
    box-sizing: border-box;
    cursor: row-resize;
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
      height: 2px;
      background-color: #757575;
      position: absolute;
      left: 50%;
      top: 50%;
      margin-top: -1px;
      margin-left: -1px;
      border-radius: 5px;
      &:nth-child(1) {
        margin-left: -5px;
      }
      &:nth-child(3) {
        margin-left: 3px;
      }
    }
  }
  .bottom-panel {
    box-sizing: border-box;
  }
}
</style>