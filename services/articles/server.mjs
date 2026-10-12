// 文章库服务（可写）
//
// 职责：把「每个客户的文章库」以工具的形式暴露给 agent。
// 数据源：挂载进来的文章库目录，一级子目录 = 一个客户，目录下的 .md = 该客户的文章。
//
// 设计要点：
//   - agent 通过 write_article 落库，而不是自己写文件
//   - 客户标识 = 目录名；标题 = 文件名（会自动建目录）
//   - 路径做了越界校验

import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const DATA = resolve(process.env.DATA_DIR ?? "/data/articles");
const PORT = Number(process.env.PORT ?? 8791);
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? ""; // 配了就要求 Authorization: Bearer <token>

// ---------- 路径安全 ----------
function assertName(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} 不能为空`);
  }
  if (value.includes("/") || value.includes("\\") || value.includes("..")) {
    throw new Error(`${label} 含有非法字符: ${value}`);
  }
  return value;
}

function clientDir(client) {
  const p = join(DATA, assertName(client, "客户"));
  if (p !== DATA && !p.startsWith(DATA + sep)) throw new Error("路径越界");
  return p;
}

/** 把标题变成安全的文件名 */
function titleToFile(title) {
  const clean = assertName(title, "标题").replace(/[:*?"<>|]/g, "-").trim();
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

// ---------- 数据访问 ----------
async function listArticles(client) {
  try {
    const entries = await readdir(clientDir(client), { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith(".md")) continue;
      const info = await stat(join(clientDir(client), e.name));
      out.push({
        title: e.name.replace(/\.md$/i, ""),
        file: e.name,
        chars: (await readFile(join(clientDir(client), e.name), "utf8")).length,
        updatedAt: info.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

async function readArticle(client, title) {
  try {
    return await readFile(join(clientDir(client), titleToFile(title)), "utf8");
  } catch {
    return null;
  }
}

async function writeArticle(client, title, content, draft) {
  // draft=true 落「文章库/<客户>/草稿/」，等人工在工作台确认后才进正式库（2026-10-10 人审门）
  const dir = draft ? join(clientDir(client), "草稿") : clientDir(client);
  await mkdir(dir, { recursive: true });
  const file = join(dir, titleToFile(title));
  await writeFileAtomic(file, content);
  return file;
}

/** 先写临时文件再改名，避免写一半被读到 */
async function writeFileAtomic(file, content) {
  const { writeFile, rename } = await import("node:fs/promises");
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
}

// ---------- MCP ----------
function createMcp() {
  const mcp = new McpServer({ name: "sora-articles", version: "0.1.0" });

mcp.registerTool(
  "list_articles",
  {
    description: "列出某个客户已有的文章（标题 + 字数 + 更新时间）。",
    inputSchema: z.object({ client: z.string().describe("客户标识") }),
  },
  async ({ client }) => ({
    content: [{ type: "text", text: JSON.stringify(await listArticles(client), null, 2) }],
  }),
);

mcp.registerTool(
  "read_article",
  {
    description: "读某个客户的一篇文章的正文。",
    inputSchema: z.object({
      client: z.string().describe("客户标识"),
      title: z.string().describe("文章标题，来自 list_articles"),
    }),
  },
  async ({ client, title }) => {
    const text = await readArticle(client, title);
    return { content: [{ type: "text", text: text ?? `未找到：客户 ${client} 的文章《${title}》` }] };
  },
);

mcp.registerTool(
  "write_article",
  {
    description:
      "把一篇文章写进文章库。默认写入草稿区（文章库/<客户>/草稿/），等人工确认后才正式入库；只有用户明确说「直接入库」时才允许写正式库。这是产出文章的唯一出口——写完后不要再把正文写进别处。",
    inputSchema: z.object({
      client: z.string().describe("客户标识"),
      title: z.string().describe("文章标题（会成为文件名）"),
      content: z.string().describe("文章正文（Markdown）"),
      draft: z.boolean().optional().describe("true=写草稿区（缺省行为，日常都该用这个）；false=写正式库，仅限用户明确说「直接入库」"),
    }),
  },
  async ({ client, title, content, draft }) => {
    const isDraft = draft !== false;
    const file = await writeArticle(client, title, content, isDraft);
    const chars = content.length;
    const label = isDraft ? "已写入草稿区（等待人工确认入库）" : "已写入正式文章库";
    return {
      content: [{ type: "text", text: `${label}：客户「${client}」《${title}》，${chars} 字。\n落库路径：${file}` }],
    };
  },
);

  return mcp;
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: "20mb" }));

// ---------- 鉴权 ----------
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** 配了 AUTH_TOKEN 就要求 Bearer；没配则放行（仅限本机开发） */
function requireAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
  if (!match || !safeEqual(match[1], AUTH_TOKEN)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// 健康检查不鉴权（方便探活，且不泄露任何数据）
app.get("/health", (_req, res) => res.json({ ok: true, service: "sora-articles" }));

app.use(requireAuth);

app.get("/articles/:client", async (req, res) => res.json(await listArticles(req.params.client)));
app.get("/article/:client/:title", async (req, res) => {
  const text = await readArticle(req.params.client, req.params.title);
  if (text == null) return res.status(404).type("text/plain").send("not found");
  res.type("text/markdown").send(text);
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  // 每个请求一个自己的 server 实例：McpServer 同一时间只能挂一个 transport，
  // 共用单例会在长连接/并发下抛 "Already connected to a transport"（2026-10-10 修）
  const server = createMcp();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[sora-articles] listening on :${PORT}  data=${DATA}`);
  if (!AUTH_TOKEN) console.warn("[sora-articles] ⚠️  AUTH_TOKEN 未配置 —— 无鉴权，切勿暴露到公网");
});
