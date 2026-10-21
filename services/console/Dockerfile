FROM node:22-alpine

# git：知识库版本历史（kbstore.mjs）。默认 CDN 在服务器上会卡住，换阿里云镜像
RUN sed -i 's#dl-cdn.alpinelinux.org#mirrors.aliyun.com#g' /etc/apk/repositories \
 && apk add --no-cache git

WORKDIR /app

# 依赖只有实时协同那三个（yjs / hocuspocus / ws），走国内镜像装
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com

COPY server.mjs kbstore.mjs shares.mjs merge3.mjs collab.mjs ./
COPY public ./public

ENV NODE_ENV=production
EXPOSE 8793

CMD ["node", "server.mjs"]
