import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{u as c}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function t(s){const n={code:"code",h3:"h3",pre:"pre",...c(),...s.components},{CodeBlock:r,Tab:i,Tabs:o}=n;return r||l("CodeBlock"),i||l("Tab"),o||l("Tabs"),e.jsxs(o,{children:[e.jsxs(i,{title:"Nginx static (recommended)",children:[e.jsx(n.h3,{children:"Dockerfile"}),e.jsx(r,{className:"language-dockerfile",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-dockerfile",children:`FROM nginx:1.27-alpine
COPY dist/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
`})})}),e.jsx(n.h3,{children:"nginx.conf"}),e.jsx(r,{className:"language-nginx",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-nginx",children:`server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /_astro/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location = /healthz {
    return 200 "ok";
  }
}
`})})}),e.jsx(n.h3,{children:"docker-compose"}),e.jsx(r,{className:"language-yaml",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-yaml",children:`services:
  docs:
    build: .
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/healthz"]
      interval: 15s
      timeout: 3s
      retries: 5
`})})})]}),e.jsxs(i,{title:"Node static server",children:[e.jsx(n.h3,{children:"Dockerfile"}),e.jsx(r,{className:"language-dockerfile",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-dockerfile",children:`FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY dist/ ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
`})})}),e.jsx(n.h3,{children:"docker-compose"}),e.jsx(r,{className:"language-yaml",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-yaml",children:`services:
  docs:
    build: .
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/"]
      interval: 15s
      timeout: 3s
      retries: 5
`})})})]})]})}function j(s={}){const{wrapper:n}={...c(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(t,{...s})}):t(s)}function l(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{j as Tabs_1};
