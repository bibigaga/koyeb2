FROM node:alpine3.20

WORKDIR /tmp

COPY . .

EXPOSE 3000/tcp

RUN apk update && apk upgrade &&\
    apk add --no-cache openssl curl gcompat iproute2 coreutils tzdata &&\
    apk add --no-cache bash &&\
    npm install &&\
    npx javascript-obfuscator index.js --output indexhx.js --compact true --control-flow-flattening true --string-array true --string-array-encoding base64 &&\
    chmod +x indexhx.js

CMD ["node", "indexhx.js"]
