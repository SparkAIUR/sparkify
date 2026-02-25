import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{u as i}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function r(o){const n={code:"code",pre:"pre",...i(),...o.components},{CodeBlock:t,Tab:a,Tabs:s}=n;return t||p("CodeBlock"),a||p("Tab"),s||p("Tabs"),e.jsxs(s,{children:[e.jsx(a,{title:"Local app",children:e.jsx(t,{className:"language-bash",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-bash",children:`npx sparkify export-openapi --fastapi "app.main:app" --out ./docs/openapi.json
`})})})}),e.jsx(a,{title:"Custom python/env/cwd",children:e.jsx(t,{className:"language-bash",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-bash",children:`npx sparkify export-openapi \\
  --fastapi "service.main:app" \\
  --python python3.11 \\
  --env-file ./.env \\
  --cwd ./backend \\
  --pythonpath ./src \\
  --server-url https://api.example.com \\
  --out ./docs/openapi.json
`})})})})]})}function j(o={}){const{wrapper:n}={...i(),...o.components};return n?e.jsx(n,{...o,children:e.jsx(r,{...o})}):r(o)}function p(o,n){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{j as Tabs_1};
