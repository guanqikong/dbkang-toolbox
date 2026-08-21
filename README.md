# DBKang Toolbox（阿康工具箱）

DBKang Toolbox 是一个嵌入学习通 Web 课程环境的学习增强工具。

## 工程结构

```text
apps/
├── toolbox/       学生端 Vue Web App
├── admin/         管理员 Vue Web App
├── userscript/    学习通桥接 Userscript
└── browser/       Windows 便携 Chromium、更新器与自解压构建器
packages/
├── chaoxing/      学习通页面适配层
├── shared/        共享 TypeScript 类型与工具
└── ui/            共享视觉令牌与基础样式
server/            FastAPI、SQLite、Alembic
docs/              经对话确认的产品决策
```

## 本地启动

要求：Node.js 22+、pnpm 11+、Python 3.12+、uv。

```bash
cp .env.example .env
pnpm install
uv sync --project server --all-groups
pnpm dev
```

产品入口：`http://localhost:8000`。学生端位于 `/toolbox/`，管理端位于 `/admin/`，API 位于 `/api/v1/`，Userscript 位于 `/updates/DBKangToolbox.user.js`；它们共用同一协议、域名和端口。首次启动后请在管理端添加真实课程。

Docker Compose 把学生端挂载到 `/toolbox/`、管理端挂载到 `/admin/`。Lo-fi 视频与环境音位于 `server/assets/lofi/`，构建镜像时写入 `/app/assets/lofi/`；修改后需要重新构建镜像。歌曲不会进入镜像，运行时只读挂载 `server/assets/music/` 到 `/app/assets/music/`。每个歌单使用一个子目录并在其中放置 MP3，增删歌曲后重启服务以重新扫描。部署前还需把 `DBKANG_PUBLIC_BASE_URL` 设置为对外域名。

## 验证

```bash
pnpm check
pnpm server:test
```

## 学习通适配

- 课程以学习通 `courseId` 为唯一键；教学班以 `clazzid`（代码与 API 中为 `classId`）为唯一键。
- 后台课程名称只是管理员备注；学生端始终显示学生本人在当前学习通页面看到的课程名称。
- 学号与姓名从已登录的 `passport2.chaoxing.com/mooc/accountManage` 页面读取，并按当前课程的 `fid` 选择单位。
- 作业列表从当前课程页提供的 `courseId + clazzid + cpi + enc` 上下文读取；已完成作业详情解析 `workId`、作业名、得分和满分。只有学生打开工具箱时才同步。
- 页面出现真实 `.warn-txt` 结课提示时不注入入口；服务端仍二次拒绝已结课上下文。

## Windows 便携 Chromium

构建配置在 [`apps/browser/browser.config.json`](apps/browser/browser.config.json)，当前固定 Windows x64 Chromium `141.0.7390.37`（Playwright `1.56.1`）。构建不会自行追踪最新版；升级内核必须显式修改配置和依赖锁。

Windows x64 构建机执行：

```powershell
$env:DBKANG_VERSION="0.1.0"
$env:DBKANG_PUBLIC_BASE_URL="https://toolbox.example.com"
pnpm --filter @dbkang/userscript build
pnpm --filter @dbkang/browser build:windows
```

产物写入 `release/browser/`：

- `DBKangBrowser-Setup-<version>.exe`：单文件自解压安装/离线升级包，在 EXE 同目录创建 `DBKangBrowser/`。
- `browser/stable/latest.json`、版本清单、文件级更新源和完整 ZIP：Stable 自动更新源。
- `SHA256SUMS.txt`：安装包、完整包和清单校验值。

便携目录不写注册表、系统目录、`AppData` 或快捷方式；Chromium 数据只写入 `DBKangBrowser/user-data/`。更新只在启动时检查，支持“立即更新 / 下次启动提醒”，文件级差分失败后回退完整包；新版本启动确认失败会恢复备份并把该版本加入本地黑名单。更新与离线升级均排除 `user-data/`。

推送 `vX.Y.Z` Tag 会在 Windows runner 构建并自检上述产物，再将安装包附加到 GitHub Release、把更新源装入服务镜像。也可从 Actions 手动运行 `Windows Browser Build` 获取同样的可下载构建。
