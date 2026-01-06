const text = "ts文件导入成功";
function allowServiceWorker() {
  return "serviceWorker" in navigator && location.protocol === "https:";
}
export {
  allowServiceWorker,
  text
};
