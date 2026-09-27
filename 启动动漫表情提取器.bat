@echo off
chcp 65001 >nul
title AnimeFace Lab - 动漫表情提取器
cd /d "%~dp0"

echo.
echo  Anime Clip 正在启动极简素材裁剪器...
echo  解析完整视频，手动规定时间，生成图片帧与视频片段。
echo  链接模式需要本机已安装 yt-dlp 与 curl-cffi。
echo  打开地址：http://127.0.0.1:5173/
echo.

if exist "E:\node_modules\npm\bin\npm-cli.js" (
  node "E:\node_modules\npm\bin\npm-cli.js" run dev -- --hostname 127.0.0.1
) else (
  npm run dev -- --hostname 127.0.0.1
)

echo.
echo  服务已停止。按任意键关闭窗口。
pause >nul
