# 无名杀(联网自用版)

本项目是 [libnoname/noname](https://github.com/libnoname/noname) 的个人 fork 版本，主要改进包括：
- 修复原版已知问题
- 优化联网模式体验
- 简化 Azure Web App 云端部署流程

个人维护项目，仅供参考使用。

## 项目使用约定

本项目基于 GPL 3.0 协议开源，使用此项目时请遵守开源协议。  
除此外，希望你在使用代码时已经了解以下额外说明：

1. 打包、二次分发 **请保留代码出处**：<https://github.com/libnoname/noname>
2. 请不要用于商业用途。

## 快速启动

### 环境要求

- [Node.js](https://nodejs.org/) ^20.19.0 || >=22.12.0
- [npm](https://www.npmjs.com/) (comes with Node.js)
- Webview: Chromium >= 91 || Safari >=16.4.0 (暂不支持Firefox)

### 安装依赖

```bash
npm install
```

### 启动

**开发模式（仅UI）：**

```bash
npm run dev
```

此命令会同时启动：
- 游戏界面（Vite 开发服务器）：`http://127.0.0.1:8089`
- 后端服务器（REST API + WebSocket）：端口 8088

**开发模式（HTTPS/WSS，包含联网服务器）：**

首先生成 SSL 证书：

```bash
npm run ssl:generate
```

然后启动带 SSL 的开发服务器：

```bash
npm run dev:ssl
```

此命令会同时启动：
- 游戏界面（HTTPS）：`https://127.0.0.1:8089`
- 后端服务器（REST API + WSS）：端口 8089

> **注意**：自签名证书会触发浏览器安全警告，开发时可选择"继续访问"。

**生产模式：**

先构建项目，然后启动：

```bash
npm run server
```

或直接运行（自动构建并启动）：

```bash
npm start
```

`npm run server` 会自动构建并启动：
- 游戏界面 + REST API + WebSocket（同一端口）：`http://localhost:8089`

**生产模式（HTTPS/WSS）：**

```bash
npm run server:ssl
```

此命令会在端口 8089 启动 HTTPS + WSS 服务器。

---
## 服务器代码
```
noname-server.cts
```


