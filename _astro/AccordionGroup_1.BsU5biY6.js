import{j as o}from"./jsx-runtime.D_zvdyIk.js";import{u as s}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function t(n){const e={code:"code",p:"p",...s(),...n.components},{Accordion:r,AccordionGroup:i}=e;return r||c("Accordion"),i||c("AccordionGroup"),o.jsxs(i,{children:[o.jsx(r,{title:"`openapi[]` entries",children:o.jsxs(e.p,{children:[`| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `,o.jsx(e.code,{children:"id"}),` | string | yes | Unique identifier |
| `,o.jsx(e.code,{children:"source"}),` | string | yes | Local file or URL |
| `,o.jsx(e.code,{children:"route"}),` | string | no | API route root |
| `,o.jsx(e.code,{children:"title"})," | string | no | Display title |"]})}),o.jsx(r,{title:"`fastapi` export options",children:o.jsxs(e.p,{children:[`| Field | Type | Notes |
| --- | --- | --- |
| `,o.jsx(e.code,{children:"app"})," | string | Python target in ",o.jsx(e.code,{children:"module:app"}),` format |
| `,o.jsx(e.code,{children:"exportPath"}),` | string | Schema output path |
| `,o.jsx(e.code,{children:"serverUrl"})," | string | Optional ",o.jsx(e.code,{children:"servers[0].url"}),` override |
| `,o.jsx(e.code,{children:"python"}),` | string | Python executable |
| `,o.jsx(e.code,{children:"envFile"}),` | string | Environment file for subprocess |
| `,o.jsx(e.code,{children:"cwd"}),` | string | Working directory |
| `,o.jsx(e.code,{children:"pythonPath"})," | string | PYTHONPATH prefix |"]})})]})}function a(n={}){const{wrapper:e}={...s(),...n.components};return e?o.jsx(e,{...n,children:o.jsx(t,{...n})}):t(n)}function c(n,e){throw new Error("Expected component `"+n+"` to be defined: you likely forgot to import, pass, or provide it.")}export{a as AccordionGroup_1};
