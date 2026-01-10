# 第一阶段：构建与混淆
FROM node:alpine3.20 AS builder
WORKDIR /build
COPY . .
RUN npm install && \
    npx javascript-obfuscator index.js --output server.js --compact true --control-flow-flattening true --string-array true --string-array-encoding base64

# 第二阶段：运行环境 (最终镜像)
FROM node:alpine3.20
WORKDIR /app
# 只拷贝混淆后的文件和必要的依赖
COPY --from=builder /build/server.js .
COPY --from=builder /build/package.json .
COPY --from=builder /build/node_modules ./node_modules

# 安装基础运行依赖 (去特征化)
RUN apk add --no-cache openssl curl tzdata

EXPOSE 3000
CMD ["node", "server.js"]
