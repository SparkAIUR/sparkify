import{j as e}from"./jsx-runtime.D_zvdyIk.js";import{u as t}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function d(s){const n={code:"code",p:"p",pre:"pre",...t(),...s.components},{CodeBlock:o,Tab:c,Tabs:i}=n;return o||r("CodeBlock"),c||r("Tab"),i||r("Tabs"),e.jsxs(i,{children:[e.jsx(c,{title:"Run with npx (recommended)",children:e.jsx(o,{className:"language-bash",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-bash",children:`npx sparkify dev --docs-dir ./docs
npx sparkify doctor --docs-dir ./docs
npx sparkify build --docs-dir ./docs --out ./dist
`})})})}),e.jsxs(c,{title:"Run from local clone",children:[e.jsx(o,{className:"language-bash",children:e.jsx(n.pre,{children:e.jsx(n.code,{className:"language-bash",children:`npm ci
npm run dev -- --docs-dir ./docs
npx tsx packages/cli/src/bin.ts doctor --docs-dir ./docs
npx tsx packages/cli/src/bin.ts build --docs-dir ./docs --out ./dist
`})})}),e.jsxs(n.p,{children:["First ",e.jsx(n.code,{children:"npm run dev"})," auto-builds internal workspace dependencies."]})]})]})}function f(s={}){const{wrapper:n}={...t(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(d,{...s})}):d(s)}function r(s,n){throw new Error("Expected component `"+s+"` to be defined: you likely forgot to import, pass, or provide it.")}export{f as Tabs_1};
