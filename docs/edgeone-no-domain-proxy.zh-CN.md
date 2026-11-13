# 无域名：使用 EdgeOne 独立边缘函数为 SudokuPadX 提供题库代理

**适合当前项目的过渡方案**：游戏网页仍放在已有的
https://fanfront.github.io/sudokupadX/ ，不搬迁页面。只尝试将
Logic Masters 搜索和 WPF 索引/PDF 下载代理放在 EdgeOne **独立边缘函数**默认访问域名下。

> 注意：这是 **EdgeOne 网站安全加速 / 独立边缘函数**（Edge Functions）的「无域名接入」，**不是 EdgeOne Makers / Pages 的默认项目域名**。后者面向大陆访客有 401 / 3 小时预览链接限制，不能提供稳定公开服务。两类产品套餐和免费额度也可能不同，创建资源前请确认控制台账单及配额。
>
> **未在中国大陆网络环境完成实际验证**。自 2025-09-08 起，EdgeOne 会对大陆用户访问独立边缘函数默认域名的响应强制加上 `Content-Disposition: attachment`。这会导致直接在浏览器打开链接时下载文件。SudokuPadX 使用 JavaScript `fetch` 读取接口响应，理论上可以读取 attachment 响应数据，但还必须确保跨域请求得到 200、CORS 正确且未被其他策略阻断。不能把「默认域名可创建」理解为「大陆分享一定可用」。

## 1. 在 EdgeOne 创建无域名站点与边缘函数

1. 登录 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)，选择 **网站安全加速**；按照提示 **添加站点 → 无域名接入**（No Domain Access），绑定你已确认可用的套餐。无需购买域名，也不需更改 GitHub Pages。
2. 进入该站点的 **边缘函数 → 函数管理 → 新建函数**，创建例如 `sudokupadx-cors`。
3. 把仓库中的 [worker/edgeone-default-domain.js](../worker/edgeone-default-domain.js) **全部内容**复制到函数代码编辑器，保存并部署。代码已经内嵌受限 URL 白名单，不支持将任意目标 URL 当作代理参数。
4. 从控制台复制**该函数的默认访问域名**。URL 由平台产生，无需自定义域名。当前实现假设五个 API 路由都直接挂在默认域名的根路径下：
   - `/v1/lmd/search?q=sudoku&sort=neu`
   - `/v1/lmd/puzzle?id=ABC123`
   - `/v1/wpf/index`
   - `/v1/wpf/type?id=225`
   - `/v1/wpf/pdf?url=<已编码的官方 WPF PDF URL>`

如果未来更新了 `worker/remote-proxy.js` 的安全校验，先执行
`node scripts/build-edgeone-proxy.mjs`，再复制更新后的独立边缘函数代码。

## 2. **先在真正的中国大陆网络测试**，再对外推广

在一个中国大陆网络环境中打开 GitHub Pages，在其 F12 DevTools Console 运行以下示例（自行替换域名）：

```js
const base = 'https://YOUR-EDGEONE-DEFAULT-FUNCTION-DOMAIN';
const r = await fetch(base + '/v1/wpf/index', {credentials:'omit'});
console.log(r.status, r.headers.get('content-type'), (await r.text()).slice(0,120));
```

必须同时满足：
- `status` 为 200，且不是 CORS / Failed to fetch / 401；
- 响应内容确实来自 WPF 索引，而非下载提示或防护页；
- Logic Masters 搜索 `/v1/lmd/search?q=sudoku&sort=neu` 也能返回源站 HTML；
- 使用 WPF PDF 接口可以通过 `fetch(...).arrayBuffer()` 读取真实 `%PDF-` 开头的文件，而不是触发下载或重定向。

**直接在地址栏打开默认函数链接会触发下载是已知平台行为**；地址栏下载与程序 `fetch` 的结果可能不同，必须以实际 `fetch` 验证为准。若上述测试失败，不要启用此默认域名，也不要认为已有 CORS 修复可达。

## 3. 更新已有 GitHub Pages 构建设置

仓库 **Settings → Secrets and variables → Actions → Variables** 修改或增加：

- `PUZZLE_PROXY_URL = https://YOUR-EDGEONE-DEFAULT-FUNCTION-DOMAIN`

该 URL 不是密码，不必放在 Secrets 中。然后重新运行 **Deploy SudokuPad X to GitHub Pages**；已有构建将它注入 `VITE_PUZZLE_PROXY_URL`。**无需调整客户端代码或 Android 代码**。现有的 `src/puzzle-proxy.js` 会自动继续使用同样五个路径。

如大陆访问测试失败，请将变量改回可用代理或暂时留空，再重新部署。这样用户仍可继续使用 GitHub Pages 的内置游戏和离线题库。

## 限制、费用和以后正式公开部署

- 此方案使用 EdgeOne **网站安全加速的边缘函数**，不等于 Makers Free 的「Edge Functions 每月免费调用额度」可直接用在这里。**确认实际套餐是否免费，避免误开付费资源。**
- 函数只能访问 `logic-masters.de`、`logic-puzzles.ropeko.ch` 和官方 `gp.worldpuzzle.org` PDF 目录；只接受 GET/OPTIONS，限制来源为 `https://fanfront.github.io`（加本地开发端口），拒绝重定向和超限内容。
- 代理只解决浏览器跨域限制；上游网站不可用、EdgeOne 运行节点到源站的访问故障、平台默认域名风控等问题仍可能出现。
- 由于默认域名的大陆地区特殊策略，适合**试验和小范围分享**。如果需要长期稳定公开，仍建议自有域名；国内加速节点还要求符合备案规定。
- PDF 为原站提供的内容，按其版权及使用规则访问，不建议批量镜像或公开转载。

权威参考：
- [EdgeOne 无域名接入](https://edgeone.ai/document/54208)
- [EdgeOne 边缘函数创建与默认访问域名](https://edgeone.ai/zh/document/53375)
- [默认函数域名中国大陆访问行为调整公告](https://intl.cloud.tencent.com/zh/announce/detail/100813)
- [EdgeOne Makers 的默认域名访问限制（注意与独立 Edge Functions 区分）](https://pages.edgeone.ai/document/domain-overview)
