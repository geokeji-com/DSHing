// Offline copies of /workspace/dark-mode/PALETTE.md (Harness + dsh-cloud tokens.css).
export const darkPalette = `
html[data-dsh-station="workbench"] body[data-ds-dark-theme]{
 --dsw-alias-bg-base:#151517;--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-layer-3:#353638;
 --dsw-alias-border-l1:#ffffff0f;--dsw-alias-border-l2:#ffffff1f;--dsw-alias-border-l3:#ffffff29;
 --dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;
 --dsw-specific-sidebar-fill:#1b1b1c;--dsw-specific-sidebar-nav-item-hover:#2c2c2e;--dsw-specific-sidebar-nav-item-active:#43454a;
 --dsw-alias-interactive-bg-hover:#ffffff14;--dsw-alias-interactive-bg-active:#ffffff24;
 --dsh-bg:#151517;--dsh-card:#232324;--dsh-sunken:#1b1b1c;--dsh-line:rgba(255,255,255,.12);--dsh-line-2:rgba(255,255,255,.06);
 --dsh-ink:#f9fafb;--dsh-ink-2:#cfd3d6;--dsh-ink-3:#adb2b8;--dsh-ink-4:#61666b;
 --dsh-blue:#3361e0;--dsh-blue-700:#2a50c4;--dsh-blue-500:#5a80f0;--dsh-blue-100:#243256;--dsh-blue-50:#1d2a4d;--dsh-blue-ink:#8fa8ff;
 --dsh-orange:#ff6a1f;--dsh-orange-700:#ff9a5c;--dsh-orange-50:#3a2216;
 --dsh-green:#3ecf8e;--dsh-green-50:#12241d;--dsh-amber:#f0b429;--dsh-amber-50:#33290f;--dsh-red:#ff7b7b;--dsh-red-50:#3a1f1f;
 --dsh-shadow-1:0 1px 2px rgba(0,0,0,.45);--dsh-shadow-2:0 8px 24px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4);--dsh-shadow-up:0 -8px 24px rgba(0,0,0,.45);
 --dsh-on-accent:#ffffff;--dsh-tabbar-bg:rgba(35,35,36,.96);--dsh-topbar-bg:rgba(21,21,23,.96);--dsh-scrim:rgba(0,0,0,.6);
 /* Only the fixture's native Harness/shared-shell surfaces, never wb_* components. */
 color-scheme:dark;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
}
body[data-ds-dark-theme] .fixture_composerSeat{background:var(--dsw-alias-bg-base)}
body[data-ds-dark-theme] dsh-tabbar{background:var(--dsh-tabbar-bg)}
body[data-ds-dark-theme] dsh-tabbar a{color:var(--dsh-blue-ink)}
`

// Audit rendered text (including inputs, placeholders and generated labels).
// Composite translucent ancestor backgrounds and opacity; reject offscreen,
// clipped and overlay-obscured nodes using hit testing at the text rectangles.
// This measures CSS colors, not glyph antialiasing, images or emoji glyph pixels.
export async function auditDarkPage(page, name) {
 const result = await page.evaluate(() => {
  const failures=[], nearWhite=[], intentional=[], checked=[], states=[]
  const rgba=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [n[0],n[1],n[2],n[3]??1]}
  const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]))
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)
  const label=el=>el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.trim().replace(/\s+/g,'.'):'')
  const visible=(el,rects)=>{
   if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false
   return Array.from(rects).some(r=>{
    const left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom)
    if(right<=left||bottom<=top)return false
    return [.2,.5,.8].some(f=>{const hit=document.elementFromPoint(left+(right-left)*f,(top+bottom)/2);return hit&&(hit===el||el.contains(hit))})
   })
  }
  const background=el=>{
   const chain=[];for(let e=el;e;e=e.parentElement)chain.unshift(e)
   let bg=[255,255,255],opacity=1
   for(const e of chain){const s=getComputedStyle(e);opacity*=Number(s.opacity);const c=rgba(s.backgroundColor);c[3]*=opacity;bg=over(c,bg)}
   return {bg,opacity}
  }
  const check=(el,text,style,bg,opacity,kind='text')=>{
   if(!text.trim())return
   const c=rgba(style.color);c[3]*=opacity*Number(style.opacity||1)
   const actual=ratio(over(c,bg),bg), size=parseFloat(style.fontSize), large=size>=24||(size>=18.66&&parseFloat(style.fontWeight)>=700)
   const min=kind==='placeholder'?3:large?3:4.5
   const item={element:label(el),kind,text:text.trim().slice(0,100),foreground:style.color,background:bg.map(v=>Math.round(v)),ratio:+actual.toFixed(3),minimum:min}
   checked.push(item);if(actual+.001<min)failures.push(item)
  }
  for(const el of document.body.querySelectorAll('*')){
   if(['STYLE','SCRIPT'].includes(el.tagName)||!visible(el,el.getClientRects()))continue
   const s=getComputedStyle(el),{bg,opacity}=background(el), own=rgba(s.backgroundColor)
   if(own[3]&&lum(bg)>.8){
    const item={element:label(el),background:s.backgroundColor,luminance:+lum(bg).toFixed(3)}
    // The intentionally inverted selected style chip is specified by the palette contract.
    if(el.matches('.wb_mStyles .wb_mChip[aria-pressed=true]'))intentional.push(item);else nearWhite.push(item)
   }
   for(const node of el.childNodes){
    if(node.nodeType!==Node.TEXT_NODE||!node.textContent.trim())continue
    const range=document.createRange();range.selectNodeContents(node)
    if(visible(el,range.getClientRects()))check(el,node.textContent,{color:s.color,fontSize:s.fontSize,fontWeight:s.fontWeight},bg,opacity)
   }
   if(el.matches('input:not([type=file]),textarea')){
    if(el.value)check(el,el.value,{color:s.color,fontSize:s.fontSize,fontWeight:s.fontWeight},bg,opacity)
    else if(el.placeholder)check(el,el.placeholder,getComputedStyle(el,'::placeholder'),bg,opacity,'placeholder')
   }
   for(const pseudo of ['::before','::after']){
    const ps=getComputedStyle(el,pseudo)
    if(ps.content&& !['none','normal','""',"''"].includes(ps.content))check(el,ps.content,ps,over(rgba(ps.backgroundColor),bg),opacity)
   }
   // State icons/borders: decorative separators deliberately aren't state indicators.
   if(el.matches('.wb_mClient>.wb_mRadio,.wb_pkChip.is-on,.wb_mChip[aria-pressed=true],.wb_ticon[data-s=run],.wb_ticon[data-s=wait],.wb_mStatus')){
    const parent=background(el.parentElement).bg
    const color=el.matches('.wb_mStatus')?s.backgroundColor:s.borderTopColor
    const actual=ratio(over(rgba(color),parent),parent),item={element:label(el),kind:'state',color,ratio:+actual.toFixed(3),minimum:3}
    states.push(item);if(actual+.001<3)failures.push(item)
   }
  }
  return {checked,states,failures,nearWhite,intentional}
 })
 return {name,...result}
}
