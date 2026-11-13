# Web 题库 CORS 代理部署

SudokuPadX 网页版运行在 GitHub Pages（静态托管）。第三方题库没有提供允许浏览器跨域访问的 HTTP 响应头，**修改前端 fetch/CSP、使用 `no-cors` 或 Service Worker 都无法绕过**。本项目使用单独的 Cloudflare Worker，只转发严格限定的公开题库资源：

| 接口 | 上游站点 | 用途 |
|---|---|---|
| `/v1/lmd/search` | logic-masters.de | Logic Masters 关键词搜索、排序和翻页 |
| `/v1/lmd/puzzle?id=ABC123` | logic-masters.de | 读取作者题目页面、规则、链接 |
| `/v1/wpf/index` | logic-puzzles.ropeko.ch | WPF 赛事与题型索引 |
| `/v1/wpf/type?id=225` | logic-puzzles.ropeko.ch | WPF 题型详情及 PDF 链接 |
| `/v1/wpf/pdf?url=...` | gp.worldpuzzle.org | WPF 官方赛事题册 PDF |

Worker 只允许 GET、固定路径、受限参数、官方 PDF 路径，禁止重定向和请求凭证。网页浏览器默认只允许 `https://fanfront.github.io`、`http://localhost:1420` 和 `http://127.0.0.1:1420` 作为来源。HTML 按纯文本返回，不执行第三方页面脚本；下载大小最大分别为 1/4/24 MiB。

## 一次性部署

1. **先将包含此工作流的 PR 合并到 main**，或者自行在本地使用 Wrangler 部署；然后创建或使用现有的 Cloudflare 账户，在 Worker 设置中启用 `workers.dev` 子域名。
2. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Secrets** 中增加 `CLOUDFLARE_API_TOKEN`（权限 Workers Scripts: Edit）和 `CLOUDFLARE_ACCOUNT_ID`。
3. 在 GitHub Actions 里手动运行 **Deploy puzzle-source CORS relay**，它执行 `npx wrangler@4 deploy --config worker/wrangler.toml`。记录返回的 `https://sudokupadx-puzzle-proxy.<你的子域>.workers.dev` URL。
4. 在仓库 **Settings → Secrets and variables → Actions → Variables** 中新增 `PUZZLE_PROXY_URL`，值为上一步的完整 HTTPS URL。**这是公开配置，不是秘密。**
5. 重新运行 **Deploy SudokuPad X to GitHub Pages**，构建将把该配置注入 `VITE_PUZZLE_PROXY_URL`。之后网页题库搜索、题目详情和 PDF 下载才会实际通过 Worker 工作。

请勿把 Cloudflare API 令牌填入 `PUZZLE_PROXY_URL` 或提交到仓库。没有部署的 Worker URL 不能从静态网页自动推断，所以缺少配置时前端会显示明确错误，而不会假装已经绕过 CORS。

## 本地开发与验证

```sh
# 将地址换成你部署的 Worker
VITE_PUZZLE_PROXY_URL=https://sudokupadx-puzzle-proxy.<subdomain>.workers.dev npm run dev:web
npm test
```

浏览器的开发者工具 Network 中应看到 `/v1/lmd/search`、`/v1/wpf/index` 等代理请求，而不是直接跨域请求原站点。也可使用浏览器打开以下 URL 验证 Worker 是否可用：

```text
https://sudokupadx-puzzle-proxy.<subdomain>.workers.dev/v1/wpf/index
https://sudokupadx-puzzle-proxy.<subdomain>.workers.dev/v1/lmd/search?q=sudoku&sort=neu
```

Worker 拒绝非官方主机、任意 URL、非 GET、过大响应、站点重定向和伪装 PDF。代理解决的是 **CORS**；如果第三方站点本身离线、限制数据中心请求或某个 PDF 地址不存在，仍会显示对应错误，不应将错误伪装成 CORS。Android 原有 Rust 原生下载流程不受影响。

> 部署 Worker 后，请按官方网站使用条款适度访问，避免批量自动抓取、超量流量。
