# Deploy: Self-Host in Containers

Build docs once, then serve `dist/` behind your own infrastructure.

```bash
npx sparkify build --docs-dir ./docs --out ./dist --site https://docs.example.com --base ""
```

<Tabs>
  <Tab title="Nginx static (recommended)">

### Dockerfile

```dockerfile
FROM nginx:1.27-alpine
COPY dist/ /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### nginx.conf

```nginx
server {
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
```

### docker-compose

```yaml
services:
  docs:
    build: .
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/healthz"]
      interval: 15s
      timeout: 3s
      retries: 5
```

  </Tab>
  <Tab title="Node static server">

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY dist/ ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
```

### docker-compose

```yaml
services:
  docs:
    build: .
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/"]
      interval: 15s
      timeout: 3s
      retries: 5
```

  </Tab>
</Tabs>

## Operational notes

- Rebuild image whenever docs content changes.
- Keep reverse-proxy gzip/brotli and TLS at edge.
- If hosting under subpath, build with matching `--base`.
