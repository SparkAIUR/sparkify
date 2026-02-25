import{j as n}from"./jsx-runtime.D_zvdyIk.js";import{r as c}from"./index.BMc0qTdX.js";import"./_commonjsHelpers.CqkleIqs.js";const i=`
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>
`;function a(){const o=document.querySelectorAll(".mdx-content pre.astro-code");for(const t of o){if(t.querySelector(".spark-copy-code-btn"))continue;t.style.position="relative";const e=document.createElement("button");e.type="button",e.className="spark-copy-code-btn",e.ariaLabel="Copy code",e.innerHTML=i,e.addEventListener("click",async()=>{const r=t.innerText.replace(/\n$/,"");try{await navigator.clipboard.writeText(r)}catch{}}),t.appendChild(e)}}function p(){return c.useEffect(()=>{a()},[]),n.jsx("style",{children:`
      .spark-copy-code-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        border: 1px solid rgb(229 231 235);
        background: rgb(255 255 255 / 0.95);
        color: rgb(107 114 128);
        border-radius: 0.45rem;
        width: 1.75rem;
        height: 1.75rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .spark-copy-code-btn:hover {
        color: rgb(55 65 81);
      }
    `})}export{p as default};
