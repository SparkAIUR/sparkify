import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{u as c}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function a(o){const n={code:"code",pre:"pre",...c(),...o.components},{CodeBlock:i,Tab:t,Tabs:r}=n;return i||s("CodeBlock"),t||s("Tab"),r||s("Tabs"),e.jsxs(r,{children:[e.jsx(t,{title:"Endpoint pages (default)",children:e.jsx(i,{className:"language-json",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-json",children:`{
  "api": {
    "mode": "endpoint-pages",
    "apiRoot": "/api-reference"
  }
}
`})})})}),e.jsx(t,{title:"Single-page fallback",children:e.jsx(i,{className:"language-json",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-json",children:`{
  "api": {
    "mode": "single-page",
    "apiRoot": "/api"
  }
}
`})})})})]})}function f(o={}){const{wrapper:n}={...c(),...o.components};return n?e.jsx(n,{...o,children:e.jsx(a,{...o})}):a(o)}function s(o,n){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{f as Tabs_1};
