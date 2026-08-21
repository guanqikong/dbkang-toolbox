# Lo-fi 媒体资源

以下资源在 Docker 镜像构建时写入 `/app/assets/lofi/`，不会由运行时挂载覆盖：

- `background.mp4`：必须存在，静音循环播放；缺失时自习室按产品规则阻断。
- `rain.mp3`
- `wind.mp3`
- `fire.mp3`

环境音可按需提供，单个文件缺失只会关闭对应环境音。

修改这些文件后需执行 `docker compose up -d --build` 重新构建镜像。歌曲不放在本目录；请按 `server/assets/music/<歌单名>/*.mp3` 组织，并由 Compose 只读挂载。
