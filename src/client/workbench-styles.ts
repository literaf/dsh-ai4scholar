/** SearchWorkspace/SearchRowShell proportions, expressed through Harness theme tokens. */
export const WORKBENCH_CSS = `
.ai4s-wb {
  --wb-bg:var(--dsw-alias-bg-layer-1,#fff);
  --wb-text:var(--dsw-alias-label-primary,#222);
  --wb-muted:var(--dsw-alias-label-secondary,#737373);
  --wb-panel:color-mix(in srgb,var(--wb-text) 3.5%,var(--wb-bg));
  --wb-hover:color-mix(in srgb,var(--wb-text) 5%,transparent);
  --wb-border:color-mix(in srgb,var(--wb-text) 10%,transparent);
  --wb-rule:color-mix(in srgb,var(--wb-text) 6%,transparent);
  display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;overflow:auto;
  background:var(--wb-bg);color:var(--wb-text);font:14px/1.55 var(--dsh-font-family-content,system-ui,sans-serif);
  padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 24px 20px;
  container:ai4s-workbench / inline-size;box-sizing:border-box;color-scheme:inherit;
}
.ai4s-wb *{box-sizing:border-box}
:where(.ai4s-wb button,.ai4s-wb input,.ai4s-wb select){font:inherit;color:inherit}
.ai4s-wb button,.ai4s-wb select{cursor:pointer}
.ai4s-wb button:disabled{opacity:.35;cursor:default}
.ai4s-wb button:focus-visible,.ai4s-wb input:focus-visible,.ai4s-wb select:focus-visible,.ai4s-wb a:focus-visible{outline:2px solid color-mix(in srgb,var(--wb-text) 60%,transparent);outline-offset:2px}
.ai4s-wb a{color:inherit;text-underline-offset:3px}
.ai4s-wb svg{flex-shrink:0}
.ai4s-wb h1,.ai4s-wb h2,.ai4s-wb h3,.ai4s-wb p{margin:0}
.ai4s-wb mark{background:color-mix(in srgb,#b39938 24%,transparent);color:inherit;border-radius:2px;padding:0 1px}
.ai4s-wb-header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px 16px;min-height:36px;margin-bottom:18px;flex-shrink:0;font-size:13px;padding-left:max(0px,calc(var(--dsh-frame-leading-clearance,0px) - 24px))}
.ai4s-wb-header>div{display:flex;align-items:center;gap:12px;min-width:0}
.ai4s-wb-header>.ai4s-wb-header-actions{gap:8px;flex-shrink:0;margin-left:auto}
.ai4s-wb-header-divider{height:16px;width:1px;background:var(--wb-border)}
.ai4s-wb-header-title{color:var(--wb-muted)}
.ai4s-wb-header .ai4s-cmd-brand{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}
.ai4s-wb-button,.ai4s-wb-links a{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--wb-border);border-radius:8px;background:transparent;padding:6px 10px;min-height:34px;text-decoration:none;line-height:1.4;font-size:12px;white-space:nowrap;transition:background-color .15s,border-color .15s}
.ai4s-wb-button:hover:not(:disabled),.ai4s-wb-links a:hover{background:var(--wb-hover);border-color:color-mix(in srgb,var(--wb-text) 18%,transparent)}
.ai4s-wb-icon-button{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;border-radius:8px;width:32px;height:32px;flex-shrink:0;color:var(--wb-muted)}
.ai4s-wb-icon-button:hover{background:var(--wb-hover);color:var(--wb-text)}
.ai4s-wb-update{position:relative}
.ai4s-wb-update-popover{position:absolute;z-index:40;top:calc(100% + 8px);right:0;width:min(320px,calc(100cqw - 2px));max-width:calc(100vw - 32px);background:var(--wb-bg);border:1px solid var(--wb-border);border-radius:14px;box-shadow:0 8px 30px #0002,0 2px 6px #0001;overflow:hidden}
.ai4s-wb-update-body{padding:16px;display:flex;flex-direction:column;gap:14px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.ai4s-wb-update-result{font-weight:550}
.ai4s-wb-update-body dl{display:flex;flex-direction:column;gap:8px;margin:0}
.ai4s-wb-update-body dl>div{display:flex;justify-content:space-between;gap:16px}
.ai4s-wb-update-body dt,.ai4s-wb-update-hint{color:var(--wb-muted)}
.ai4s-wb-update-body dd{margin:0;font-variant-numeric:tabular-nums;text-align:right}
.ai4s-wb-update-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--wb-rule)}
.ai4s-wb-workspace{display:flex;flex-direction:column;min-width:0;min-height:0;gap:12px;flex:1}
.ai4s-wb-workspace>:not(.ai4s-wb-results){flex-shrink:0}
.ai4s-wb-start{width:100%;max-width:896px;margin:0 auto;justify-content:center;padding:40px 0 100px;min-height:min-content}
.ai4s-wb-hero{text-align:center;margin-bottom:18px}
.ai4s-wb-hero h1{font-size:32px;font-weight:600;letter-spacing:-.7px;line-height:1.3}
.ai4s-wb-hero p{color:var(--wb-muted);margin-top:10px;font-size:14px;line-height:1.7}
.ai4s-wb-search-box{position:relative;border:1px solid var(--wb-border);border-radius:24px;background:color-mix(in srgb,var(--wb-text) 2.5%,transparent);padding:20px;min-width:0;transition:border-color .15s}
.ai4s-wb-search-box:focus-within{border-color:color-mix(in srgb,var(--wb-text) 23%,transparent)}
.ai4s-wb-sources-row{display:flex;align-items:center;gap:8px;margin-bottom:16px;min-width:0}
.ai4s-wb-sources{position:relative;display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow-x:auto;scrollbar-width:none;padding:2px;margin:-2px}
.ai4s-wb-sources::-webkit-scrollbar{display:none}
.ai4s-wb-source,.ai4s-wb-preprints{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--wb-border);border-radius:11px;background:transparent;padding:7px 10px;white-space:nowrap;min-height:36px;flex-shrink:0;color:var(--wb-muted);font-size:13px;line-height:20px;font-weight:500}
.ai4s-wb-source:hover{background:var(--wb-hover);color:var(--wb-text)}
.ai4s-wb-source.is-selected,.ai4s-wb-preprints.is-selected{background:var(--wb-text);color:var(--wb-bg);border-color:transparent}
.ai4s-wb-preprints{max-width:130px}
.ai4s-wb-preprints option{background:var(--wb-bg);color:var(--wb-text)}
.ai4s-wb-query-row{display:flex;flex-direction:column;gap:12px;margin:0;min-width:0}
.ai4s-wb-query-field{display:flex;align-items:center;position:relative;min-width:0;flex:1;background:color-mix(in srgb,var(--wb-text) 2.5%,transparent);border-radius:12px}
.ai4s-wb-query-field input{border:0;background:transparent;border-radius:12px;padding:19px 42px 19px 16px;height:64px;width:100%;min-width:0;font-size:16px;outline:none!important}
.ai4s-wb-query-field:focus-within{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wb-text) 18%,transparent)}
.ai4s-wb-query-field input::placeholder{color:var(--wb-muted);opacity:.85}
.ai4s-wb-query-field input::-webkit-search-cancel-button{display:none}
.ai4s-wb-clear{position:absolute;right:7px}
.ai4s-wb-search-actions{display:flex;align-items:center;gap:4px;min-width:0;width:100%}
.ai4s-wb-filter-trigger{border-color:transparent;padding:6px 8px;color:var(--wb-muted)}
.ai4s-wb-filter-trigger.is-active{color:var(--wb-text);background:var(--wb-hover)}
.ai4s-wb-filter-count{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;border-radius:5px;background:var(--wb-text);color:var(--wb-bg);font-size:10px}
.ai4s-wb-cost{margin-left:7px;margin-right:auto;padding:0 10px 0 12px;border-left:1px solid var(--wb-border);color:var(--wb-muted);font-size:12px;white-space:nowrap}
.ai4s-wb-submit{display:flex;justify-content:center;align-items:center;border:0;border-radius:50%;width:40px;height:40px;flex-shrink:0;margin-left:4px;background:var(--wb-text);color:var(--wb-bg)!important;transition:opacity .15s,transform .15s}
.ai4s-wb-submit:hover:not(:disabled){opacity:.85}.ai4s-wb-submit:active:not(:disabled){transform:scale(.95)}
.ai4s-wb-stop{width:12px;height:12px;background:currentColor;border-radius:2px}
.ai4s-wb-has-results .ai4s-wb-search-box{padding:12px;border-radius:16px}
.ai4s-wb-has-results .ai4s-wb-sources-row{margin-bottom:12px}
.ai4s-wb-has-results .ai4s-wb-query-row{flex-direction:row;align-items:center}
.ai4s-wb-has-results .ai4s-wb-query-field input{height:44px;padding:10px 40px 10px 14px;font-size:15px}
.ai4s-wb-has-results .ai4s-wb-search-actions{width:auto;flex-shrink:0}
.ai4s-wb-has-results .ai4s-wb-cost{margin-right:6px}
.ai4s-wb-popover{position:absolute;z-index:30;top:calc(100% + 8px);width:320px;max-width:calc(100% - 24px);background:var(--wb-bg);border:1px solid var(--wb-border);border-radius:14px;box-shadow:0 8px 30px #0002,0 2px 6px #0001;overflow:hidden;max-height:min(470px,70vh);overflow-y:auto}
.ai4s-wb-popover-filters{left:12px}.ai4s-wb-popover-history{right:12px}
.ai4s-wb-has-results .ai4s-wb-popover-filters{left:auto;right:12px}
.ai4s-wb-popover-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px 8px 16px;border-bottom:1px solid var(--wb-rule)}
.ai4s-wb-popover-head h3{font-size:13px;font-weight:550}
.ai4s-wb-filter-fields{padding:16px;display:flex;flex-direction:column;gap:16px}
.ai4s-wb-filter-fields label{display:flex;flex-direction:column;gap:6px;color:var(--wb-muted);font-size:12px;min-width:0;flex:1}
.ai4s-wb-filter-fields input,.ai4s-wb-filter-fields select{width:100%;min-width:0;background:transparent;color:var(--wb-text);border:1px solid var(--wb-border);border-radius:8px;padding:8px 10px;min-height:36px;font-size:12px}
.ai4s-wb-filter-fields input::placeholder{color:var(--wb-muted)}
.ai4s-wb-year-range{display:flex;align-items:flex-end;gap:10px}
.ai4s-wb-year-range>span{padding-bottom:8px;color:var(--wb-muted);font-size:11px}
.ai4s-wb-filter-hint{font-size:11px;color:var(--wb-muted);line-height:1.6}
.ai4s-wb-popover-footer{display:flex;justify-content:space-between;gap:8px;padding:12px 16px;border-top:1px solid var(--wb-rule)}
.ai4s-wb .ai4s-wb-primary{background:var(--wb-text);color:var(--wb-bg);border-color:transparent}
.ai4s-wb .ai4s-wb-primary:hover{background:var(--wb-text);opacity:.85}
.ai4s-wb-history-list{padding:6px;max-height:320px;overflow-y:auto}
.ai4s-wb-history-list>p{padding:16px 10px;color:var(--wb-muted);font-size:12px}
.ai4s-wb-history-list button{display:flex;align-items:flex-start;gap:10px;background:transparent;border:0;padding:10px;border-radius:8px;width:100%;text-align:left;color:var(--wb-muted)}
.ai4s-wb-history-list button:hover{background:var(--wb-hover)}
.ai4s-wb-history-list button>span{display:flex;flex-direction:column;gap:3px;min-width:0}
.ai4s-wb-history-list strong{font-size:12px;font-weight:500;color:var(--wb-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai4s-wb-history-list small{font-size:10px}
.ai4s-wb-examples{display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin-top:8px}
.ai4s-wb-examples button{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--wb-rule);border-radius:30px;padding:9px 14px;min-height:38px;background:color-mix(in srgb,var(--wb-text) 2%,transparent);color:var(--wb-muted);font-size:12px}
.ai4s-wb-examples button:hover{background:var(--wb-hover);color:var(--wb-text)}
.ai4s-wb-source-hint{font-size:11px;color:var(--wb-muted);padding:10px 2px 0;line-height:1.7}
.ai4s-wb-status{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--wb-border);background:var(--wb-panel);border-radius:10px;overflow-wrap:anywhere;font-size:12px}
.ai4s-wb-status .ai4s-wb-button{margin-left:auto;flex-shrink:0}
.ai4s-wb-error{color:var(--dsw-alias-state-error-primary,#bb4e45);font-size:12px}
.ai4s-wb-spinner{display:inline-block;width:13px;height:13px;border:2px solid var(--wb-border);border-top-color:currentColor;border-radius:50%;animation:ai4s-wb-spin 1s linear infinite;flex-shrink:0}
@keyframes ai4s-wb-spin{to{transform:rotate(360deg)}}
.ai4s-wb-result-context{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px;color:var(--wb-muted);padding:0 2px;min-height:18px}
.ai4s-wb-result-context>span:last-child{flex-shrink:0}
.ai4s-wb-query-context{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai4s-wb-pending{font-size:11px;color:var(--wb-muted);padding:0 2px;margin-top:-6px!important}
.ai4s-wb-results{display:grid;grid-template-columns:minmax(250px,var(--wb-list-width,40%)) 16px minmax(0,1fr);flex:1;min-height:260px;min-width:0}
.ai4s-wb-results.ai4s-wb-list-only{grid-template-columns:minmax(0,1fr)}
.ai4s-wb-list,.ai4s-wb-detail{display:flex;flex-direction:column;border-radius:16px;background:var(--wb-panel);min-width:0;min-height:0;overflow:hidden}
.ai4s-wb-panel-head{display:flex;align-items:center;gap:8px;justify-content:space-between;height:50px;padding:8px 16px;border-bottom:1px solid var(--wb-rule);flex-shrink:0;font-size:13px;font-weight:500}
.ai4s-wb-result-count{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai4s-wb-panel-head small{color:var(--wb-muted);font-size:11px;font-weight:400}
.ai4s-wb-panel-actions{display:flex;align-items:center;gap:2px;margin-left:auto}
.ai4s-wb-list ol{list-style:none;padding:4px 8px 8px;margin:0;overflow:auto;flex:1;min-height:0;overscroll-behavior:contain;scrollbar-width:thin}
.ai4s-wb-result{display:flex;gap:10px;text-align:left;width:100%;padding:12px;border:0;border-radius:9px;background:transparent;line-height:1.55;transition:background-color .15s}
.ai4s-wb-result:hover{background:var(--wb-hover)}
.ai4s-wb-result.is-selected{background:color-mix(in srgb,var(--wb-text) 8%,transparent)}
.ai4s-wb-result-number{font-size:11px;color:var(--wb-muted);min-width:16px;margin-top:2px;font-variant-numeric:tabular-nums}
.ai4s-wb-result-content{display:flex;flex-direction:column;min-width:0;flex:1}
.ai4s-wb-result-content strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13px;font-weight:500;line-height:1.55;overflow-wrap:anywhere}
.ai4s-wb-result-authors{font-size:11.5px;line-height:20px;color:var(--wb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
.ai4s-wb-result-meta{display:flex;align-items:center;gap:7px;color:var(--wb-muted);font-size:11.5px;line-height:20px;min-width:0}
.ai4s-wb-result-meta>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai4s-wb-result-meta small{font-size:10px;white-space:nowrap;flex-shrink:0}
.ai4s-wb-fulltext{color:color-mix(in srgb,#339b70 80%,var(--wb-text))}
.ai4s-wb-result-excerpt{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:11.5px;line-height:1.7;color:var(--wb-muted);margin-top:4px}
.ai4s-wb-pagination{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid var(--wb-rule);font-size:11px;color:var(--wb-muted);flex-shrink:0;min-height:48px}
.ai4s-wb-pagination>div{display:flex;align-items:center;gap:2px}
.ai4s-wb-pagination button{border-color:transparent;min-height:30px;padding:4px 8px}
.ai4s-wb-divider{display:flex;justify-content:center;align-items:center;cursor:col-resize;touch-action:none;outline:none}
.ai4s-wb-divider>span{height:40px;width:2px;border-radius:2px;background:var(--wb-border);transition:background-color .15s}
.ai4s-wb-divider:hover>span,.ai4s-wb-divider:focus-visible>span{background:color-mix(in srgb,var(--wb-text) 40%,transparent)}
.ai4s-wb-detail-body{padding:20px 28px 28px;overflow:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin}
.ai4s-wb-detail-body article{max-width:78ch;margin:0 auto}
.ai4s-wb-detail h2{font-size:18px;font-weight:600;line-height:1.65;margin-bottom:12px;overflow-wrap:anywhere}
.ai4s-wb-detail article>p{margin-bottom:8px;overflow-wrap:anywhere}
.ai4s-wb-detail article>p>a{color:var(--wb-muted);font-size:12px}
.ai4s-wb-muted,.ai4s-wb-meta{color:var(--wb-muted);font-size:12px;line-height:1.9}
.ai4s-wb-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ai4s-wb-tag{display:inline-block;padding:1px 6px;border-radius:4px;background:var(--wb-hover);font-size:10px}
.ai4s-wb-links{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 8px;font-size:12px}
.ai4s-wb-links a{min-height:32px;border-radius:7px}
.ai4s-wb-links svg{width:15px;height:15px}
.ai4s-wb-abstract{margin-top:24px;padding-top:20px;border-top:1px solid var(--wb-border)}
.ai4s-wb-abstract h3{font-size:12px;color:var(--wb-muted);font-weight:500;margin-bottom:12px}
.ai4s-wb-abstract p{font-size:13px;line-height:2;white-space:pre-wrap;overflow-wrap:anywhere}
.ai4s-wb-abstract p.ai4s-wb-content-note{font-size:11px;color:var(--wb-muted);margin-bottom:12px}
.ai4s-wb-facts{margin:18px 0 0;font-size:12px}
.ai4s-wb-facts>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px;margin-bottom:8px}
.ai4s-wb-facts dt{color:var(--wb-muted)}.ai4s-wb-facts dd{margin:0;overflow-wrap:anywhere}
.ai4s-wb-mobile-back{display:none}
.ai4s-wb-empty{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:10px;min-height:280px;flex:1;color:var(--wb-muted)}
.ai4s-wb-empty h2{color:var(--wb-text);font-size:18px;font-weight:550}
.ai4s-wb-empty p{font-size:12px}
.ai4s-wb-settings{max-width:1000px;width:100%;margin:12px auto}
.ai4s-wb-settings .ai4s-page{padding:0}
@container ai4s-workbench (max-width:880px){
  .ai4s-wb-source,.ai4s-wb-preprints{font-size:12px;padding:6px 9px;min-height:34px}
  .ai4s-wb-source svg{width:15px;height:15px}
  .ai4s-wb-detail-body{padding:18px 20px}
  .ai4s-wb-start{padding-bottom:60px}
}
@container ai4s-workbench (max-width:680px){
  .ai4s-wb-header-divider,.ai4s-wb-header-title{display:none}
  .ai4s-wb-header{margin-bottom:14px}
  .ai4s-wb-start{padding:32px 0 48px}
  .ai4s-wb-hero h1{font-size:28px}
  .ai4s-wb-hero p{font-size:13px}
  .ai4s-wb-search-box{padding:12px;border-radius:18px}
  .ai4s-wb-sources-row{gap:7px;margin-bottom:12px}
  .ai4s-wb-sources{gap:6px}
  .ai4s-wb-source svg{display:none}
  .ai4s-wb-source,.ai4s-wb-preprints{font-size:12px}
  .ai4s-wb-preprints{max-width:105px}
  .ai4s-wb-query-field input{height:54px;font-size:14px;padding-left:12px}
  .ai4s-wb-has-results .ai4s-wb-query-row{flex-direction:column;gap:9px}
  .ai4s-wb-has-results .ai4s-wb-query-field{width:100%}
  .ai4s-wb-has-results .ai4s-wb-search-actions{width:100%}
  .ai4s-wb-has-results .ai4s-wb-cost{margin-right:auto}
  .ai4s-wb-cost{font-size:11px;padding-left:9px;padding-right:5px}
  .ai4s-wb-submit{width:36px;height:36px}
  .ai4s-wb-popover-filters,.ai4s-wb-has-results .ai4s-wb-popover-filters{left:0;right:auto;max-width:100%}
  .ai4s-wb-popover-history{right:0;max-width:100%}
  .ai4s-wb-result-context{align-items:flex-start;flex-direction:column;gap:3px;font-size:10px}
  .ai4s-wb-query-context{display:block;max-width:100%}
  .ai4s-wb-results{display:flex;min-height:300px}
  .ai4s-wb-results>.ai4s-wb-list,.ai4s-wb-results>.ai4s-wb-detail{flex:1}
  .ai4s-wb-results .ai4s-wb-detail,.ai4s-wb-divider{display:none}
  .ai4s-wb-show-detail .ai4s-wb-list{display:none}
  .ai4s-wb-show-detail .ai4s-wb-detail{display:flex}
  .ai4s-wb-mobile-back{display:inline-flex;margin-left:-6px}
  .ai4s-wb-desktop-close{display:none}
  .ai4s-wb-detail-body{padding:18px}
  .ai4s-wb-detail h2{font-size:17px}
  .ai4s-wb-status{flex-wrap:wrap}
  .ai4s-wb-status .ai4s-wb-button{margin-left:0}
  .ai4s-wb-examples{gap:8px;margin-top:6px}
  .ai4s-wb-examples button{font-size:11px;padding:8px 12px;min-height:34px}
}
@media(prefers-reduced-motion:reduce){.ai4s-wb *{animation:none!important;transition:none!important}}
`
export function installWorkbenchStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-ai4scholar'
  tag.dataset.pluginCss = 'dsh-ai4scholar/workbench'
  tag.textContent = WORKBENCH_CSS
  document.head.appendChild(tag)
  return () => tag.remove()
}
