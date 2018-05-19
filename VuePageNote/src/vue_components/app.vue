<template>
  <v-app dark>
    <v-navigation-drawer
      v-model="drawer"
      fixed
      app
    >
      <v-list dense>
        <v-list-tile >
          <v-list-tile-action>
            <v-icon>dashboard</v-icon>
          </v-list-tile-action>
          <v-list-tile-content>
            <v-list-tile-title>Dashboard</v-list-tile-title>
          </v-list-tile-content>
        </v-list-tile>
        <v-list-tile>
          <v-list-tile-action>
            <v-icon>settings</v-icon>
          </v-list-tile-action>
          <v-list-tile-content>
            <v-list-tile-title>Settings</v-list-tile-title>
          </v-list-tile-content>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-toolbar app fixed>
      <v-toolbar-side-icon @click.stop="drawer = !drawer"></v-toolbar-side-icon>
      <v-toolbar-title>Felix's Notes App</v-toolbar-title>
    </v-toolbar>
    <v-content>
      <note></note>
    </v-content>
    <v-footer app fixed>
      <span v-html="copyright"></span>
    </v-footer>
  </v-app>
</template>
<script>
import note from "./note/note";

export default {
  data: function() {
    return {
      copyright: `Copyright &copy; ${new Date().getFullYear()}, Felix Zhao`,
      drawer: false
    };
  },
  components: {
    note
  }
};
</script>
<style lang="less" scoped>
.footer {
  text-align: center;
  padding-top: 7px;
  display: inline-block;
}
</style>
