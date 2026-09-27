import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const host = "127.0.0.1";
const port = Number(process.env.ANIMEFACE_LINK_BRIDGE_PORT || 5174);
const sessions = new Map();
const maxAgeMs = 2 * 60 * 60 * 1000;

const platformHosts = [
  /(^|\.)bilibili\.com$/i,
  /(^|\.)b23\.tv$/i,
  /(^|\.)douyin\.com$/i,
  /(^|\.)iesdouyin\.com$/i,
  /(^|\.)kuaishou\.com$/i,
  /(^|\.)kwai\.com$/i,
];

function cors(origin) {
  const allowed = origin === "http://127.0.0.1:5173" || origin === "http://localhost:5173";
  return {
    "access-control-allow-origin": allowed ? origin : "http://127.0.0.1:5173",
    "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
    "access-control-allow-headers": "content-type,range",
    "access-control-expose-headers": "content-length,content-range,accept-ranges,content-type,content-disposition",
    vary: "origin",
  };
}

function json(response, body, status = 200, origin = "") {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(origin) });
  response.end(JSON.stringify(body));
}

function isSupportedPage(url) {
  return url.protocol === "https:" && platformHosts.some(pattern => pattern.test(url.hostname));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容过大。");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function resolvePlatformUrl(pageUrl) {
  const executable = process.env.YT_DLP_PATH || "yt-dlp";
  const args = [
    "--no-playlist",
    "--skip-download",
    "--no-warnings",
    "--no-update",
    "--impersonate", "chrome",
    "-f", "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=h264][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/bestvideo[ext=webm]+bestaudio/best",
    "--dump-single-json",
    pageUrl,
  ];
  const { stdout } = await execFileAsync(executable, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 24 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  const metadata = JSON.parse(stdout);
  const requestedFormats = Array.isArray(metadata.requested_formats) ? metadata.requested_formats : [];
  const selected = metadata.url ? metadata : requestedFormats.find(item => item.url && item.vcodec !== "none");
  if (!selected?.url) throw new Error("平台返回了页面信息，但没有可供浏览器读取的视频轨道。");
  const upstream = new URL(selected.url);
  if (upstream.protocol !== "https:" && upstream.protocol !== "http:") throw new Error("解析结果不是受支持的HTTP视频流。");
  const token = randomUUID();
  const headers = Object.fromEntries(Object.entries(selected.http_headers ?? metadata.http_headers ?? {}).filter(([, value]) => typeof value === "string"));
  sessions.set(token, {
    upstream: upstream.toString(),
    headers,
    createdAt: Date.now(),
    mimeType: selected.ext === "webm" ? "video/webm" : "video/mp4",
    codec: String(selected.vcodec || "unknown"),
    title: String(metadata.title || metadata.fulltitle || metadata.id || "链接视频"),
    duration: Number(metadata.duration || 0),
    width: Number(selected.width || metadata.width || 0),
    height: Number(selected.height || metadata.height || 0),
    size: Number(selected.filesize || selected.filesize_approx || metadata.filesize_approx || 0),
    provider: String(metadata.extractor_key || metadata.extractor || upstream.hostname),
    pageUrl,
  });
  const embeddedAudio = Boolean(selected.acodec && selected.acodec !== "none");
  const audio = embeddedAudio ? null : requestedFormats.find(item => item.url && item.vcodec === "none" && item.acodec && item.acodec !== "none");
  let audioToken = null;
  let audioCodec = embeddedAudio ? String(selected.acodec) : "none";
  if (audio?.url) {
    const audioUpstream = new URL(audio.url);
    if (audioUpstream.protocol === "https:" || audioUpstream.protocol === "http:") {
      audioToken = randomUUID();
      audioCodec = String(audio.acodec || "unknown");
      const audioHeaders = Object.fromEntries(Object.entries(audio.http_headers ?? metadata.http_headers ?? {}).filter(([, value]) => typeof value === "string"));
      sessions.set(audioToken, {
        upstream: audioUpstream.toString(),
        headers: audioHeaders,
        createdAt: Date.now(),
        mimeType: audio.ext === "webm" ? "audio/webm" : audio.ext === "mp3" ? "audio/mpeg" : "audio/mp4",
        codec: audioCodec,
        title: String(metadata.title || metadata.fulltitle || metadata.id || "链接视频"),
        duration: Number(metadata.duration || 0),
        width: 0,
        height: 0,
        size: Number(audio.filesize || audio.filesize_approx || 0),
        provider: String(metadata.extractor_key || metadata.extractor || audioUpstream.hostname),
        pageUrl,
      });
    }
  }
  return { token, audioToken, audioCodec, hasAudio: embeddedAudio || Boolean(audioToken), embeddedAudio, ...sessions.get(token) };
}

function cleanExpiredSessions() {
  const cutoff = Date.now() - maxAgeMs;
  for (const [token, session] of sessions) if (session.createdAt < cutoff) sessions.delete(token);
}

function downloadDisposition(title, mimeType) {
  const extension = mimeType === "video/webm" ? "webm" : "mp4";
  const base = String(title || "video").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120) || "video";
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${base}.${extension}`)}`;
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors(origin));
    response.end();
    return;
  }
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  if (requestUrl.pathname === "/health") {
    json(response, { ok: true, resolver: "yt-dlp", supported: ["bilibili", "douyin", "kuaishou"] }, 200, origin);
    return;
  }
  if (requestUrl.pathname === "/resolve" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const page = new URL(String(body.url || ""));
      if (!isSupportedPage(page)) {
        json(response, { error: "目前只接受B站、抖音、快手及其官方短链接的HTTPS页面。" }, 400, origin);
        return;
      }
      cleanExpiredSessions();
      const resolved = await resolvePlatformUrl(page.toString());
      json(response, {
        title: resolved.title,
        duration: resolved.duration,
        width: resolved.width,
        height: resolved.height,
        size: resolved.size,
        mimeType: resolved.mimeType,
        codec: resolved.codec,
        provider: resolved.provider,
        pageUrl: resolved.pageUrl,
        streamUrl: `http://${host}:${port}/stream/${resolved.token}`,
        audioUrl: resolved.audioToken ? `http://${host}:${port}/audio/${resolved.audioToken}` : null,
        audioCodec: resolved.audioCodec,
        hasAudio: resolved.hasAudio,
        audioMode: resolved.embeddedAudio ? "embedded" : resolved.audioToken ? "separate" : "none",
        downloadUrl: `http://${host}:${port}/download/${resolved.token}`,
        expiresInSeconds: maxAgeMs / 1000,
        notice: "仅解析无需登录且公开可访问的视频轨道；不读取浏览器Cookie，不绕过DRM、付费或账号权限。",
      }, 200, origin);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = /412/.test(raw)
        ? "平台拒绝了匿名解析请求（HTTP 412）。该链接可能需要稍后重试或平台授权。"
        : /login|cookie|sign in|members/i.test(raw)
          ? "该链接需要登录或账号权限，系统不会读取Cookie或绕过限制。"
          : `链接解析失败：${raw.split("\n")[0]}`;
      json(response, { error: message }, 422, origin);
    }
    return;
  }
  const streamMatch = requestUrl.pathname.match(/^\/(stream|audio|download)\/([0-9a-f-]+)$/i);
  if (streamMatch && (request.method === "GET" || request.method === "HEAD")) {
    cleanExpiredSessions();
    const asDownload = streamMatch[1].toLowerCase() === "download";
    const asAudio = streamMatch[1].toLowerCase() === "audio";
    const session = sessions.get(streamMatch[2]);
    if (!session) {
      json(response, { error: "视频链接会话已过期，请重新解析。" }, 410, origin);
      return;
    }
    try {
      const upstreamHeaders = { ...session.headers };
      if (request.headers.range) upstreamHeaders.Range = request.headers.range;
      const connectController = new AbortController();
      const connectTimer = setTimeout(() => connectController.abort(new Error("连接上游视频超时。")), 30_000);
      let upstream;
      try {
        upstream = await fetch(session.upstream, { method: request.method, headers: upstreamHeaders, redirect: "follow", signal: connectController.signal });
      } finally {
        clearTimeout(connectTimer);
      }
      if (!upstream.ok && upstream.status !== 206) throw new Error(`上游视频返回HTTP ${upstream.status}`);
      const headers = { ...cors(origin), "cache-control": "private, max-age=300", "content-type": asAudio ? session.mimeType : upstream.headers.get("content-type") || session.mimeType, "accept-ranges": upstream.headers.get("accept-ranges") || "bytes" };
      if (asDownload) headers["content-disposition"] = downloadDisposition(session.title, session.mimeType);
      for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      response.writeHead(upstream.status, headers);
      if (request.method === "HEAD" || !upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      const clientClosed = request.destroyed || response.destroyed || /aborted|premature close|cancel/i.test(error instanceof Error ? error.message : String(error));
      if (clientClosed) return;
      if (!response.headersSent) json(response, { error: error instanceof Error ? error.message : "视频流读取失败。" }, 502, origin);
      else response.destroy();
    }
    return;
  }
  json(response, { error: "Not found" }, 404, origin);
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.log(`Anime Clip link bridge already running at http://${host}:${port}`);
    process.exit(0);
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Anime Clip link bridge: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
