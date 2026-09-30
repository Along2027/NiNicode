# 居家疗愈地图 V5 — Vercel 部署版

页面已内置浏览器 IndexedDB 缓存，并会调用 `/api/selector` 将填写状态同步至云端 PostgreSQL。后端使用签名的 HttpOnly Cookie 为每个浏览器建立匿名会话，不在前端暴露数据库凭据。

## 部署到 Vercel

1. 将本目录推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Vercel 新建项目并导入仓库，Framework Preset 选择 `Other`。
3. 在 Vercel Marketplace 添加 Neon Postgres（也可使用自己的兼容 PostgreSQL）。
4. 确认项目环境变量中有 `DATABASE_URL`。
5. 新增 `SESSION_SECRET`，值使用至少 32 字节的随机字符串。PowerShell 可执行：

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

6. 点击 Deploy。首次访问 API 时会自动创建 `healing_map_states` 表。

## 当前的数据归属方式

- 每个浏览器获得一个签名匿名 Cookie，用户之间的数据相互隔离。
- 同一浏览器再次打开网站会加载此前云端记录。
- 清除 Cookie 或更换设备后，会被视为新用户。若需要跨设备登录，应进一步接入 Vercel Auth、Clerk 或 Supabase Auth，并用登录用户 ID 替换匿名会话 ID。
- 页面上传的图片会压缩后作为记录的一部分存入 JSONB；单条记录限制为 4 MB。正式研究项目更建议将图片拆分存入对象存储。

## 本地开发

安装 Vercel CLI 后，在本目录创建 `.env.local`（不要提交），然后运行：

```powershell
npm install
vercel dev
```

直接双击 HTML 仍会以离线模式运行，只保存在当前浏览器中。
