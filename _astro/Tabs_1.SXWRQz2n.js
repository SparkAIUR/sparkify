import{j as n}from"./jsx-runtime.D_zvdyIk.js";import{u as a}from"./mintlify-components-provider.qRH2aouK.js";import"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";import"./icon.gG8nFjUr.js";import"./cn.C3L7WLNA.js";import"./preload-helper.UGPCEoP0.js";import"./index.BmIY2Wo1.js";function i(o){const e={code:"code",pre:"pre",...a(),...o.components},{CodeBlock:r,Tab:s,Tabs:c}=e;return r||t("CodeBlock"),s||t("Tab"),c||t("Tabs"),n.jsxs(c,{children:[n.jsx(s,{title:"`docs.json` preferred",children:n.jsx(r,{className:"language-json",children:n.jsx(e.pre,{children:n.jsx(e.code,{className:"language-json",children:`{
  "compat": {
    "allowMintJson": true,
    "preferDocsJson": true
  }
}
`})})})}),n.jsx(s,{title:"`mint.json` only",children:n.jsx(r,{className:"language-json",children:n.jsx(e.pre,{children:n.jsx(e.code,{className:"language-json",children:`{
  "compat": {
    "allowMintJson": true,
    "preferDocsJson": false
  }
}
`})})})})]})}function h(o={}){const{wrapper:e}={...a(),...o.components};return e?n.jsx(e,{...o,children:n.jsx(i,{...o})}):i(o)}function t(o,e){throw new Error("Expected component `"+o+"` to be defined: you likely forgot to import, pass, or provide it.")}export{h as Tabs_1};
