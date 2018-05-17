"use strict";

const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: {
    app: "./index.js"
  },
  output: {
    path: path.resolve(__dirname, "../public/assets/js/dist"),
    filename: "[name].js"
  },
  mode: "production",
  resolve: {
    extensions: [".js", ".vue", ".json"],
    alias: {
      vue: "vue/dist/vue.js"
    }
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: "vue-loader",
        options: {
          // `vue-loader` options
        }
      },
    ]
  },
  plugins: [
    new webpack.optimize.SplitChunksPlugin({
      splitChunks: {
        cacheGroups: {
          commons: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all"
          }
        }
      }
    })
  ]
};
