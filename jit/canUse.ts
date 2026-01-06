export const text: string = "ts文件导入成功";

export function allowServiceWorker() {
	return import.meta.env.PROD && "serviceWorker" in navigator && location.protocol === "https:";
}
