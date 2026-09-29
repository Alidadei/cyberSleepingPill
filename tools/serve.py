#!/usr/bin/env python3
"""本地预览服务器（SW 测试用）：等价 `python -m http.server 8642`，但强制修正 MIME。

为什么存在：Windows 上 http.server 的 mimetypes 会读注册表，本机把 .js 判成
text/plain，Service Worker 脚本 MIME 检查是强制的（ unsupported MIME type
'SecurityError'），SW 本地永远注册不上。GitHub Pages 对 .js 恒返
application/javascript，线上无此问题；本脚本只服务本地验证。

用法：python tools/serve.py [port]   （默认 8642，绑 127.0.0.1）
"""
import http.server
import sys

OVERRIDES = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.webmanifest': 'application/manifest+json',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.html': 'text/html',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        import os
        ext = os.path.splitext(path)[1].lower()
        return OVERRIDES.get(ext) or super().guess_type(path)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
