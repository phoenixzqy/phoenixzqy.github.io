<template>
  <v-app dark>
    <!-- Navigation drawer-->
    <v-navigation-drawer
      v-model="drawer"
      fixed
      app
    >
      <v-list>
        <v-list-group
              v-for="(item, index) in drawerItems" 
              :key="index"
              v-model="item.active"
              :prepend-icon="item.icon"
              no-action
            >
            <v-list-tile slot="activator">
              <v-list-tile-content>
                <v-list-tile-title>{{item.title}}</v-list-tile-title>
              </v-list-tile-content>
            </v-list-tile>
            <v-list-tile v-for="(subItem, index) in item.subMenu" :key="index" @click="goTo(subItem.href, subItem.isBlank)">
              <v-list-tile-action>
                <v-icon>{{subItem.icon}}</v-icon>
              </v-list-tile-action>
              <v-list-tile-content>
                <v-list-tile-title>{{subItem.title}}</v-list-tile-title>
              </v-list-tile-content>
            </v-list-tile>
        </v-list-group>
      </v-list>
    </v-navigation-drawer>
    <!-- Header toolbar -->
    <v-toolbar app fixed>
      <v-toolbar-side-icon @click.stop="drawer = !drawer"></v-toolbar-side-icon>
      <v-toolbar-title>Felix's Notes App</v-toolbar-title>
    </v-toolbar>
    <!-- App body -->
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
          icon: "laptop_mac",
          active: true,
          title: "Felix's Note App",
          subMenu: [
            {
              icon: "book",
              title: "Public Notes",
              href: "/",
              isBlank: false
            },
            {
              icon: "security",
              title: "Private Notes",
              href: "/",
              isBlank: false
            }
          ]
        },
        {
          icon: "local_play",
          active: false,
          title: "Demos",
          subMenu: [
            {
              icon: "date_range",
              title: "Calendar Toolkit Demo",
              href: "/demo/calendar/index.html",
              isBlank: true
            },
            {
              icon: "layers",
              title: "Algorithm Simulator Demo",
              href: "/demo/algorithmSimulator/index.html",
              isBlank: true
            },
            {
              icon: "mood",
              title: "Yorke Demo",
              href: "/demo/yorkeApp/app.html",
              isBlank: true
            }
          ]
        }
      ]
    };
  },
  components: {
    note
  },
  methods: {
    goTo(url, isBlank) {
      if (isBlank) {
        window.open(url, "_blank");
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
