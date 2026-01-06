import minimist from "minimist";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { cwd } from "process";
import { exec } from "child_process";
import { WebSocketServer, WebSocket } from "ws";

class ReturnData {
	success;

	code;

	errorMsg;

	data;

	constructor() {}

	getSuccess() {
		return this.success;
	}

	setSuccess(success) {
		this.success = success;
	}

	getCode() {
		return this.code;
	}

	setCode(errorCode) {
		this.code = errorCode;
	}

	getErrorMsg() {
		return this.errorMsg;
	}

	setErrorMsg(errorMsg) {
		this.errorMsg = errorMsg;
	}

	getData() {
		this.data;
	}

	setData(data) {
		this.data = data;
	}
}

/**
 * Business is successful.
 *
 * @param data return data.
 *
 * @return json.
 */
const successfulJson = function successfulJson(data?: any) {
	const returnData = new ReturnData();
	returnData.setSuccess(true);
	returnData.setCode(200);
	returnData.setData(data);
	return returnData;
};

/**
 * Business is failed.
 *
 * @param code error code.
 * @param message message.
 *
 * @return json.
 */
const failedJson = function failedJson(code: number, message?: any) {
	const returnData = new ReturnData();
	returnData.setSuccess(false);
	returnData.setCode(code);
	returnData.setErrorMsg(message);
	return returnData;
};

const oneYear = 60 * 1000 * 60 * 24 * 365;
const defaultConfig = {
	// platform: "unknow",
	https: false,
	server: false,
	maxAge: oneYear,
	port: process.env.PORT ? parseInt(process.env.PORT) : 8089,
	debug: false,
	dirname: cwd(),
	sslDir: undefined,
	// WS allowed/whitelisted origins (comma-separated list)
	// e.g., WS_ALLOWED_ORIGINS="https://phoenixzqy.github.io,https://example.com"
	wsAllowedOrigins: process.env.WS_ALLOWED_ORIGINS
		? process.env.WS_ALLOWED_ORIGINS.split(',').map(o => o.trim())
		: undefined,
	// Home page redirect URL
	// e.g., HOME_REDIRECT_URL="https://phoenixzqy.github.io/nonamekill/"
	homeRedirectUrl: process.env.HOME_REDIRECT_URL || undefined,
};

// ========== WebSocket Server Logic ==========
interface ExtendedWebSocket extends WebSocket {
	sendl: (...args: any[]) => void;
	wsid: string;
	keyCheck?: ReturnType<typeof setTimeout>;
	onlineKey?: string;
	nickname?: string;
	avatar?: string;
	room?: any;
	owner?: ExtendedWebSocket;
	status?: string;
	servermode?: boolean;
	heartbeat?: ReturnType<typeof setInterval>;
	beat?: boolean;
	_onconfig?: ExtendedWebSocket;
}

function createWebSocketServer(server: http.Server | https.Server, isSecure: boolean, config: typeof defaultConfig) {
	const bannedKeys: string[] = [];
	const bannedIps: string[] = [];
	const rooms: any[] = [];
	const events: any[] = [];
	const clients: { [key: string]: ExtendedWebSocket } = {};
	const bannedKeyWords: string[] = [];

	// Helper function to validate origin
	const isOriginAllowed = (origin: string | undefined, req: http.IncomingMessage): boolean => {
		// If whitelist is configured, check against it
		if (config.wsAllowedOrigins && config.wsAllowedOrigins.length > 0) {
			if (!origin) {
				return false;
			}
			return config.wsAllowedOrigins.some(allowed => {
				// Support exact match or trailing slash variations
				return origin === allowed || origin === allowed.replace(/\/$/, '') || allowed.replace(/\/$/, '') === origin;
			});
		}
		
		// Default: allow all origins when no whitelist is configured
		return true;
	};

	const util = {
		getNickname: function (str: any): string {
			return typeof str === "string" ? str.slice(0, 12) : "无名玩家";
		},
		isBanned: function (str: string): boolean {
			for (const keyword of bannedKeyWords) {
				if (str.indexOf(keyword) !== -1) return true;
			}
			return false;
		},
		sendl: function (this: ExtendedWebSocket, ...args: any[]) {
			try {
				this.send(JSON.stringify(args));
			} catch (e) {
				this.close();
			}
		},
		getid: function (): string {
			return Math.floor(1000000000 + 9000000000 * Math.random()).toString();
		},
		getroomlist: function () {
			const roomlist: any[] = [];
			for (let i = 0; i < rooms.length; i++) {
				rooms[i]._num = 0;
			}
			for (const i in clients) {
				if (clients[i].room && !clients[i].servermode) {
					clients[i].room._num++;
				}
			}
			for (let i = 0; i < rooms.length; i++) {
				if (rooms[i].servermode) {
					roomlist[i] = "server";
				} else if (rooms[i].owner && rooms[i].config) {
					if (rooms[i]._num === 0) {
						rooms[i].owner.sendl("reloadroom");
					}
					roomlist.push([
						rooms[i].owner.nickname,
						rooms[i].owner.avatar,
						rooms[i].config,
						rooms[i]._num,
						rooms[i].key,
					]);
				}
				delete rooms[i]._num;
			}
			return roomlist;
		},
		getclientlist: function () {
			const clientlist: any[] = [];
			for (const i in clients) {
				clientlist.push([
					clients[i].nickname,
					clients[i].avatar,
					!clients[i].room,
					clients[i].status,
					clients[i].wsid,
					clients[i].onlineKey,
				]);
			}
			return clientlist;
		},
		updaterooms: function () {
			const roomlist = util.getroomlist();
			const clientlist = util.getclientlist();
			for (const i in clients) {
				if (!clients[i].room) {
					clients[i].sendl("updaterooms", roomlist, clientlist);
				}
			}
		},
		updateclients: function () {
			const clientlist = util.getclientlist();
			for (const i in clients) {
				if (!clients[i].room) {
					clients[i].sendl("updateclients", clientlist);
				}
			}
		},
		checkevents: function () {
			if (events.length) {
				const time = new Date().getTime();
				for (let i = 0; i < events.length; i++) {
					if (events[i].utc <= time) {
						events.splice(i--, 1);
					}
				}
			}
			return events;
		},
		updateevents: function () {
			util.checkevents();
			for (const i in clients) {
				if (!clients[i].room) {
					clients[i].sendl("updateevents", events);
				}
			}
		},
	};

	const messages: { [key: string]: (this: ExtendedWebSocket, ...args: any[]) => void } = {
		create: function (key, nickname, avatar, config, mode) {
			if (this.onlineKey !== key) return;
			this.nickname = util.getNickname(nickname);
			this.avatar = avatar;
			const room: any = {};
			rooms.push(room);
			this.room = room;
			delete this.status;
			room.owner = this;
			room.key = key;
			this.sendl("createroom", key);
		},
		enter: function (key, nickname, avatar) {
			this.nickname = util.getNickname(nickname);
			this.avatar = avatar;
			let room: any = false;
			for (const i of rooms) {
				if (i.key === key) {
					room = i;
					break;
				}
			}
			if (!room) {
				this.sendl("enterroomfailed");
				return;
			}
			this.room = room;
			delete this.status;
			if (room.owner) {
				if (
					!room.config ||
					(room.config.gameStarted &&
						(!room.config.observe || !room.config.observeReady))
				) {
					this.sendl("enterroomfailed");
				} else {
					this.owner = room.owner;
					this.owner!.sendl("onconnection", this.wsid);
				}
				util.updaterooms();
			}
		},
		changeAvatar: function (nickname, avatar) {
			this.nickname = util.getNickname(nickname);
			this.avatar = avatar;
			util.updateclients();
		},
		server: function (cfg) {
			if (cfg) {
				this.servermode = true;
				const room = rooms[cfg[0]];
				if (!room || room.owner) {
					this.sendl("reloadroom", true);
				} else {
					room.owner = this;
					this.room = room;
					this.nickname = util.getNickname(cfg[1]);
					this.avatar = cfg[2];
					this.sendl("createroom", cfg[0], {}, "auto");
				}
			} else {
				for (let i = 0; i < rooms.length; i++) {
					if (!rooms[i].owner) {
						rooms[i].owner = this;
						rooms[i].servermode = true;
						this.room = rooms[i];
						this.servermode = true;
						break;
					}
				}
				util.updaterooms();
			}
		},
		key: function (id) {
			if (!id || typeof id !== "object") {
				this.sendl("denied", "key");
				this.close();
				clearTimeout(this.keyCheck);
				delete this.keyCheck;
				return;
			} else if (bannedKeys.indexOf(id[0]) !== -1) {
				bannedIps.push((this as any)._socket?.remoteAddress);
				this.close();
			}
			this.onlineKey = id[0];
			clearTimeout(this.keyCheck);
			delete this.keyCheck;
		},
		events: function (cfg, id, type) {
			if (
				bannedKeys.indexOf(id) !== -1 ||
				typeof id !== "string" ||
				this.onlineKey !== id
			) {
				bannedIps.push((this as any)._socket?.remoteAddress);
				console.log(id, (this as any)._socket?.remoteAddress);
				this.close();
				return;
			}
			let changed = false;
			const time = new Date().getTime();
			if (cfg && id) {
				if (typeof cfg === "string") {
					for (let i = 0; i < events.length; i++) {
						if (events[i].id === cfg) {
							if (type === "join") {
								if (events[i].members.indexOf(id) === -1) {
									events[i].members.push(id);
								}
								changed = true;
							} else if (type === "leave") {
								const index = events[i].members.indexOf(id);
								if (index !== -1) {
									events[i].members.splice(index, 1);
									if (events[i].members.length === 0) {
										events.splice(i--, 1);
									}
								}
								changed = true;
							}
						}
					}
				} else if (
					Object.hasOwn(cfg, "utc") &&
					Object.hasOwn(cfg, "day") &&
					Object.hasOwn(cfg, "hour") &&
					Object.hasOwn(cfg, "content")
				) {
					if (events.length >= 20) {
						this.sendl("eventsdenied", "total");
					} else if (cfg.utc <= time) {
						this.sendl("eventsdenied", "time");
					} else if (util.isBanned(cfg.content)) {
						this.sendl("eventsdenied", "ban");
					} else {
						cfg.nickname = util.getNickname(cfg.nickname);
						cfg.avatar = cfg.nickname || "caocao";
						cfg.creator = id;
						cfg.id = util.getid();
						cfg.members = [id];
						events.unshift(cfg);
						changed = true;
					}
				}
			}
			if (changed) {
				util.updateevents();
			}
		},
		config: function (config) {
			const room = this.room;
			if (room && room.owner === this) {
				if (room.servermode) {
					room.servermode = false;
					if (this._onconfig) {
						if (clients[this._onconfig.wsid]) {
							this._onconfig.owner = this;
							this.sendl("onconnection", this._onconfig.wsid);
						}
						delete this._onconfig;
					}
				}
				room.config = config;
			}
			util.updaterooms();
		},
		status: function (str) {
			if (typeof str === "string") {
				this.status = str;
			} else {
				delete this.status;
			}
			util.updateclients();
		},
		send: function (id, message) {
			if (clients[id] && clients[id].owner === this) {
				try {
					clients[id].send(message);
				} catch (e) {
					clients[id].close();
				}
			}
		},
		close: function (id) {
			if (clients[id] && clients[id].owner === this) {
				clients[id].close();
			}
		},
	};

	const wss = new WebSocketServer({ server });
	const protocol = isSecure ? "wss" : "ws";
	
	wss.on("connection", function (ws: ExtendedWebSocket, req) {
		ws.sendl = util.sendl.bind(ws);
		const remoteAddress = req.socket.remoteAddress;
		const origin = req.headers.origin;

		// Check if origin is allowed
		if (!isOriginAllowed(origin, req)) {
			console.log(`[WS] Connection rejected from origin: ${origin}`);
			ws.sendl("denied", "origin");
			setTimeout(function () {
				ws.close();
			}, 500);
			return;
		}
		
		if (bannedIps.indexOf(remoteAddress || "") !== -1) {
			ws.sendl("denied", "banned");
			setTimeout(function () {
				ws.close();
			}, 500);
			return;
		}
		
		ws.keyCheck = setTimeout(function () {
			ws.sendl("denied", "key");
			setTimeout(function () {
				ws.close();
			}, 500);
		}, 2000);
		
		ws.wsid = util.getid();
		clients[ws.wsid] = ws;
		ws.sendl(
			"roomlist",
			util.getroomlist(),
			util.checkevents(),
			util.getclientlist(),
			ws.wsid
		);
		
		// Heartbeat interval - reduced to 20 seconds for better iOS/Safari compatibility
		// iOS Safari aggressively suspends WebSocket connections after ~30s of inactivity
		// Using 20s interval ensures connection stays alive on mobile devices
		const HEARTBEAT_INTERVAL = 20000;
		const MAX_MISSED_HEARTBEATS = 2; // Allow 2 missed heartbeats before closing
		let missedHeartbeats = 0;
		
		ws.heartbeat = setInterval(function () {
			if (ws.beat) {
				missedHeartbeats++;
				if (missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
					ws.close();
					clearInterval(ws.heartbeat);
				}
			} else {
				ws.beat = true;
				missedHeartbeats = 0;
				try {
					ws.send("heartbeat");
				} catch (e) {
					ws.close();
				}
			}
		}, HEARTBEAT_INTERVAL);
		
		ws.on("message", function (message) {
			const messageStr = message.toString();
			if (!clients[ws.wsid]) return;
			if (messageStr === "heartbeat") {
				ws.beat = false;
			} else if (ws.owner) {
				ws.owner.sendl("onmessage", ws.wsid, messageStr);
			} else {
				let arr: any[];
				try {
					arr = JSON.parse(messageStr);
					if (!Array.isArray(arr)) {
						throw new Error("err");
					}
				} catch (e) {
					ws.sendl("denied", "banned");
					return;
				}
				if (arr.shift() === "server") {
					const type = arr.shift();
					if (messages[type]) {
						messages[type].apply(ws, arr);
					}
				}
			}
		});
		
		ws.on("close", function () {
			for (let i = 0; i < rooms.length; i++) {
				if (rooms[i].owner === ws) {
					for (const j in clients) {
						if (clients[j].room === rooms[i] && clients[j] !== ws) {
							clients[j].sendl("selfclose");
						}
					}
					rooms.splice(i--, 1);
				}
			}
			if (clients[ws.wsid]) {
				if (ws.owner) {
					ws.owner.sendl("onclose", ws.wsid);
				}
				delete clients[ws.wsid];
			}
			if (ws.room) util.updaterooms();
			else util.updateclients();
		});
	});

	console.log(`[${protocol.toUpperCase()}] WebSocket server attached to HTTP server`);
	return wss;
}

export default function createApp(config = defaultConfig) {
	if (config.debug) {
		console.log(`config:`, config);
	}

	const app = express();

	app.use(
		bodyParser.json({
			limit: "10240mb",
		})
	);
	app.use(
		bodyParser.urlencoded({
			limit: "10240mb",
			extended: true, //需明确设置
		})
	);
	const join = function join(url) {
		return path.join(config.dirname, url);
	};

	const isInProject = function isInProject(url) {
		return path.normalize(join(url)).startsWith(config.dirname);
	};

	// parse application/x-www-form-urlencoded
	app.use(bodyParser.urlencoded({ extended: false }));
	// parse application/json
	app.use(bodyParser.json());

	// 全局 中间件  解决所有路由的 跨域问题
	app.all(/.*/, function (req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "X-Requested-With,Content-Type");
		res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
		next();
	});

	// 根据参数设置 maxAge
	const maxAge = config.server && !config.debug ? config.maxAge : 0;

	console.log(config.dirname);
	app.use(express.static(config.dirname, { maxAge: maxAge, dotfiles: "allow" }));

	app.get("/", (req, res) => {
		// If home redirect URL is configured, redirect to it
		if (config.homeRedirectUrl) {
			res.redirect(config.homeRedirectUrl);
			return;
		}
		res.send(fs.readFileSync(join("index.html")));
	});

	app.get("/createDir", (req, res) => {
		const { dir } = req.query;
		if (!isInProject(dir)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (!fs.existsSync(join(dir))) {
			fs.mkdirSync(join(dir), { recursive: true });
		} else {
			if (!fs.statSync(join(dir)).isDirectory()) {
				throw new Error(`${join(dir)}不是文件夹`);
			}
		}
		res.json(successfulJson(true));
	});

	app.get("/removeDir", (req, res) => {
		const { dir } = req.query;
		if (!isInProject(dir)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (fs.existsSync(join(dir))) {
			if (!fs.statSync(join(dir)).isDirectory()) {
				throw new Error(`${join(dir)}不是文件夹`);
			}
			fs.rmSync(join(dir), { recursive: true });
		}
		res.json(successfulJson(true));
	});

	app.get("/readFile", (req, res) => {
		const { fileName } = req.query;
		if (!isInProject(fileName)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (fs.existsSync(join(fileName))) {
			res.json(successfulJson(Array.prototype.slice.call(new Uint8Array(fs.readFileSync(join(fileName))))));
		} else {
			res.json(failedJson(404, "文件不存在"));
		}
	});

	app.get("/readFileAsText", (req, res) => {
		const { fileName } = req.query;
		if (!isInProject(fileName)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (fs.existsSync(join(fileName))) {
			res.json(successfulJson(fs.readFileSync(join(fileName), "utf-8")));
		} else {
			res.json(failedJson(404, "文件不存在"));
		}
	});

	app.post("/writeFile", (req, res) => {
		const { path: p, data } = req.body;
		if (!isInProject(p)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		fs.mkdirSync(path.dirname(join(p)), { recursive: true });
		fs.writeFileSync(join(p), Buffer.from(data));
		res.json(successfulJson(true));
	});

	app.get("/removeFile", (req, res) => {
		const { fileName } = req.query;
		if (!isInProject(fileName)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (!fs.existsSync(join(fileName))) {
			throw new Error(`文件不存在`);
		}
		const stat = fs.statSync(join(fileName));
		if (stat.isDirectory()) {
			throw new Error("不能删除文件夹");
		}
		fs.unlinkSync(join(fileName));
		res.json(successfulJson(true));
	});

	app.get("/getFileList", (req, res) => {
		const { dir } = req.query;
		if (!isInProject(dir)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		if (!fs.existsSync(join(dir))) {
			throw new Error(`文件夹不存在`);
		}
		const stat = fs.statSync(join(dir));
		if (stat.isFile()) {
			throw new Error("getFileList只适用于文件夹而不是文件");
		}
		const files: string[] = [],
			folders: string[] = [];
		try {
			fs.readdir(join(dir), (err, filelist) => {
				if (err) {
					res.json(failedJson(500, String(err)));
					return;
				}
				for (let i = 0; i < filelist.length; i++) {
					if (filelist[i][0] != "." && filelist[i][0] != "_") {
						if (fs.statSync(join(dir) + "/" + filelist[i]).isDirectory()) {
							folders.push(filelist[i]);
						} else {
							files.push(filelist[i]);
						}
					}
				}
				res.json(successfulJson({ folders, files }));
			});
		} catch (e) {
			res.json(failedJson(500, String(e)));
		}
	});

	app.get("/checkFile", (req, res) => {
		const { fileName } = req.query;
		if (!isInProject(fileName)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		try {
			if (fs.statSync(join(fileName)).isFile()) {
				res.json(successfulJson());
			} else {
				res.json(failedJson(404, "不是一个文件"));
			}
		} catch (error) {
			res.json(failedJson(404, "文件不存在或无法访问"));
		}
	});

	app.get("/checkDir", (req, res) => {
		const { dir } = req.query;
		if (!isInProject(dir)) {
			throw new Error(`只能访问${config.dirname}的文件或文件夹`);
		}
		try {
			if (fs.statSync(join(dir)).isDirectory()) {
				res.json(successfulJson());
			} else {
				res.json(failedJson(404, "不是一个文件夹"));
			}
		} catch (error) {
			res.json(failedJson(404, "文件夹不存在或无法访问"));
		}
	});

	app.use((req, res, next) => {
		res.status(404).send("Sorry can't find that!");
	});

	app.use(function (err, req, res, next) {
		console.log(err);
		return res.json(failedJson(400, String(err)));
	});

	const callback = () => {
		const protocol = config.https ? "https" : "http";
		console.log(`应用正在使用 ${config.port} 端口以提供无名杀本地服务器功能!`);
		console.log(`  - Web App: ${protocol}://127.0.0.1:${config.port}/`);
		console.log(`  - WebSocket: ${config.https ? "wss" : "ws"}://127.0.0.1:${config.port}/`);
		if (!config.server && !config.debug) {
			exec(`start ${protocol}://127.0.0.1:${config.port}/`);
		}
	};

	let server: http.Server | https.Server;

	if (config.https) {
		// Use provided sslDir or default to dirname/ssl
		const sslDir = config.sslDir || path.join(config.dirname, "ssl");
		const sslCertPath = path.join(sslDir, "cert.pem");
		const sslKeyPath = path.join(sslDir, "key.pem");
		if (!fs.existsSync(sslCertPath) || !fs.existsSync(sslKeyPath)) {
			console.error("[HTTPS] SSL certificates not found!");
			console.error("[HTTPS] Expected cert at:", sslCertPath);
			console.error("[HTTPS] Expected key at:", sslKeyPath);
			console.error("[HTTPS] To generate certificates, run: npm run ssl:generate");
			process.exit(1);
		}
		const SSLOptions = {
			key: fs.readFileSync(sslKeyPath),
			cert: fs.readFileSync(sslCertPath),
		};
		server = https.createServer(SSLOptions, app);
		// Attach WebSocket server
		createWebSocketServer(server, true, config);
		server.listen(config.port, callback);
	} else {
		server = http.createServer(app);
		// Attach WebSocket server
		createWebSocketServer(server, false, config);
		server.listen(config.port, callback);
	}

	return { app, server };
}

if (require.main === module) {
	// 解析命令行参数
	// 示例: -s --maxAge 100
	createApp(
		minimist(process.argv.slice(2), {
			boolean: ["https", "server", "debug"],
			string: ["sslDir"],
			alias: { server: "s" },
			default: defaultConfig,
		}) as any
	);
}
