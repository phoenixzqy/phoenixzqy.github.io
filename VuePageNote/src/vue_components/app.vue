<template>
  <v-app dark>
    <v-navigation-drawer
      v-model="drawer"
      fixed
      app
    >
      <v-list dense>
        <v-list-tile v-for="(item, index) in drawerItems" :key="index" @click="goTo(item.href, item.isBlank)">
          <v-list-tile-action>
            <v-icon>{{item.icon}}</v-icon>
          </v-list-tile-action>
          <v-list-tile-content>
            <v-list-tile-title>{{item.title}}</v-list-tile-title>
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
      drawer: false,
      drawerItems: [
        {
          icon: 'note',
          title: 'My Notes',
          href: '/',
          isBlank: false
        },
        {
          icon: 'date_range',
          title: 'Calendar Toolkit Demo',
          href: '/demo/calendar/index.html',
          isBlank: true
        },
        {
          icon: 'layers',
          title: 'Algorithm Simulator Demo',
          href: '/demo/algorithmSimulator/index.html',
          isBlank: true
        },
        {
          icon: 'mood',
          title: 'Yorke Demo',
          href: '/demo/yorkeApp/app.html',
          isBlank: true
        },
      ]
    };
  },
  components: {
    note
  },
  methods: {
    goTo(url, isBlank) {
      if(isBlank) {
        window.open(url,'_blank');
      } else {
        location.href = url;
      }
    }
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
