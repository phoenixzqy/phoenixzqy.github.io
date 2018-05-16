import App from "./vue_components/app";

// set up axios
// Add a response interceptor
axios.defaults.headers.post["Content-Type"] = "application/json"; // setup header

console.log(123123);

new Vue({
  el: "#app",
  data: function() {
    return {};
  },
  render: h => h(App),
  //   router: Router,
});
