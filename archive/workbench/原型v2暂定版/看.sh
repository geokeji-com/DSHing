#!/usr/bin/env bash
# 起一个本地静态服务看原型。
# 其实双击 原型v2暂定版.html 就能看 —— 这个脚本只是备选（比如想用手机看、或浏览器对本地文件有限制时）。
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8899}"
echo "原型地址： http://127.0.0.1:${PORT}/"
echo "（Ctrl+C 停）"
python3 -m http.server "$PORT"
