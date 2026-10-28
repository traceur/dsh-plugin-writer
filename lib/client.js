window.__ModuleLoader__.load({
  id: 'dsh-plugin-writer',
  factory: function (require) {
    var React = require('react')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useMemo = React.useMemo
    var useRef = React.useRef

    var MdHost = null
    try {
      var prim = require('@deepseek-ai/dsh-client-ui-primitives')
      if (prim && prim.MarkdownText) MdHost = prim.MarkdownText
    } catch (e) { MdHost = null }
    var MD_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }

    var PANEL_ID = 'writer'
    var DRAFT_KEY = 'dsh-writer-draft-v2'
    var PREFERRED = [
      'local-proxy/gemini-3.8-flash',
      'local-proxy/qwen3.8-max',
      'local-proxy/grok-4.7',
      'local-proxy/glm-5.3',
      'local-proxy/kimi-k3',
      'local-proxy/deepseek-v4-pro',
    ]
    var JUDGE_PREFERRED = [
      'local-proxy/deepseek-v4-pro',
      'local-proxy/claude-opus-5-5',
      'local-proxy/gemini-3.8-flash',
      'local-proxy/grok-4.7',
    ]
    var STRATEGIES = [
      { id: 'distill', label: '取精去糟', desc: '保留各稿独到且可靠的内容，剔除空话与错误，重组为最完整的终稿。' },
      { id: 'consensus', label: '共识提炼', desc: '优先保留多模型交叉印证的结论，明确标注分歧与存疑之处。' },
      { id: 'debate', label: '辩论批评', desc: '先逐稿指出硬伤与逻辑漏洞，再仅采纳经得起批评的部分。' },
    ]
    var OPTIMIZE_MODES = [
      { id: 'expand', label: '深度扩写' },
      { id: 'rigorous', label: '严谨技术' },
      { id: 'creative', label: '创意洞察' },
      { id: 'structured', label: '结构报告' },
    ]
    var TEMPLATES = [
      { label: '架构评审', topic: '给团队写一份《高并发实时消息推送系统架构设计》方案，对比 WebSocket、SSE 与 QUIC 的取舍，并给出单机百万连接下的容灾与演进路线。', focus: '面向资深后端工程师，拒绝泛泛而谈，需要具体参数指标与排障经验', strategy: 'distill' },
      { label: '行业洞察', topic: '分析 AI Coding Agent 从代码补全演进到自主软件工程的核心瓶颈：为什么上下文工程与验证闭环往往比单纯堆参数更关键？', focus: '结合实际工程案例，论点犀利、层次分明', strategy: 'debate' },
      { label: '选型对比', topic: '企业内部落地私有化知识库：RAG 检索增强生成与长上下文微调在成本、准确率、权限隔离与维护难度上的全面对比。', focus: '给出可量化的决策矩阵与不同规模团队的选型建议', strategy: 'consensus' },
    ]

    var CSS = [
      '.dsw-writer{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);position:relative;overflow:hidden;}',
      '.dsw-writer *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}',
      /* 顶部栏 */
      '.dsw-top{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;height:50px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);z-index:10;}',
      '.dsw-top-l{display:flex;align-items:center;gap:8px;min-width:0;}',
      '.dsw-top-title{font-size:14.5px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;}',
      '.dsw-top-sub{font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dsw-top-r{display:flex;align-items:center;gap:12px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.dsw-top-r b{font-weight:600;color:var(--dsw-alias-label-secondary);}',
      /* 移动端顶部分段切换器 (桌面端隐藏) */
      '.dsw-h5-bottom-bar{display:none;}',
      '.dsw-h5-tabs{display:none;align-items:center;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:2px;gap:2px;}',
      '.dsw-h5-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;padding:4px 10px;border-radius:5px;cursor:pointer;}',
      '.dsw-h5-tab.on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);}',
      /* 桌面双栏布局 */
      '.dsw-body{flex:1;min-height:0;display:grid;grid-template-columns:360px minmax(0,1fr);}',
      '.dsw-body.viewing{grid-template-columns:320px minmax(0,1fr);}',
      '.dsw-side{min-height:0;overflow-y:auto;border-right:1px solid var(--dsw-alias-border-l2);padding:16px 16px 28px;display:flex;flex-direction:column;gap:18px;-webkit-overflow-scrolling:touch;}',
      '.dsw-main{min-height:0;overflow-y:auto;padding:20px 24px 40px;display:flex;flex-direction:column;gap:18px;-webkit-overflow-scrolling:touch;}',
      '.dsw-main>*{width:100%;max-width:960px;margin-left:auto;margin-right:auto;}',
      /* 表单小节 */
      '.dsw-sec{display:flex;flex-direction:column;gap:7px;}',
      '.dsw-sec-h{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.dsw-sec-t{display:flex;align-items:baseline;gap:6px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);}',
      '.dsw-sec-t i{font-style:normal;font-variant-numeric:tabular-nums;opacity:0.75;}',
      '.dsw-sec-n{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      /* 输入控件 */
      '.dsw-field{width:100%;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;line-height:1.55;transition:border-color .12s;}',
      '.dsw-field:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);}',
      'textarea.dsw-field{min-height:100px;resize:vertical;}',
      /* 按钮系统 (包含移动端触控优化) */
      '.dsw-writer button{font:inherit;cursor:pointer;transition:all .12s;touch-action:manipulation;}',
      '.dsw-writer button:disabled{cursor:default;opacity:.45;}',
      '.dsw-btn{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:6px 11px;font-size:12.5px;}',
      '.dsw-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4);}',
      '.dsw-ghost{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:6px 10px;font-size:12px;}',
      '.dsw-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.dsw-primary{width:100%;border:1px solid transparent;background:var(--dsw-alias-state-business-primary);color:#fff;border-radius:8px;padding:11px 14px;font-size:13.5px;font-weight:600;min-height:42px;}',
      '.dsw-primary:hover:not(:disabled){filter:brightness(1.06);}',
      '.dsw-stop{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-state-error-primary);border-radius:8px;padding:10px 14px;font-size:13px;width:100%;min-height:42px;}',
      '.dsw-stop:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,var(--dsw-alias-interactive-bg-hover));}',
      /* 命题工具条与模版 */
      '.dsw-topic-bar{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:-2px;}',
      '.dsw-topic-bar-l{display:flex;align-items:center;gap:6px;}',
      '.dsw-modesel{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:7px;padding:5px 7px;font:inherit;font-size:11.5px;cursor:pointer;}',
      '.dsw-ai{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:500;}',
      '.dsw-ai:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);}',
      '.dsw-count{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      '.dsw-tpl{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}',
      '.dsw-tpl button{border:none;background:none;color:var(--dsw-alias-label-tertiary);font-size:11.5px;padding:3px 6px;border-radius:5px;}',
      '.dsw-tpl button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
      /* AI 优化建议卡片 */
      '.dsw-ai-card{border:1px solid var(--dsw-alias-border-l2);border-left:2.5px solid var(--dsw-alias-state-business-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:10px 12px;display:flex;flex-direction:column;gap:7px;}',
      '.dsw-ai-h{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.dsw-ai-t{font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);}',
      '.dsw-ai-t span{font-weight:500;letter-spacing:0;text-transform:none;color:var(--dsw-alias-label-secondary);margin-left:4px;}',
      '.dsw-ai-body{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary);white-space:pre-wrap;max-height:160px;overflow-y:auto;}',
      '.dsw-ai-imp{display:flex;flex-direction:column;gap:2px;}',
      '.dsw-ai-imp div{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding-left:10px;position:relative;}',
      '.dsw-ai-imp div::before{content:"";position:absolute;left:1px;top:7px;width:4px;height:1.5px;background:var(--dsw-alias-label-tertiary);}',
      '.dsw-ai-focus{font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.dsw-ai-focus b{font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dsw-ai-acts{display:flex;align-items:center;justify-content:flex-end;gap:6px;}',
      /* 策略卡片 */
      '.dsw-strat{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
      '.dsw-strat button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:8px 4px;text-align:center;}',
      '.dsw-strat button:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);}',
      '.dsw-strat button.on{border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary);}',
      '.dsw-strat b{display:block;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);}',
      /* 模型选择 */
      '.dsw-mbar{display:flex;align-items:center;gap:6px;}',
      '.dsw-mbar .dsw-field{flex:1;padding:5px 8px;font-size:12px;}',
      '.dsw-models{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;padding-right:2px;}',
      '.dsw-prov{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);margin:4px 0 1px;display:flex;justify-content:space-between;}',
      '.dsw-mrow{display:flex;gap:8px;align-items:center;padding:7px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;min-height:38px;}',
      '.dsw-mrow:hover{border-color:var(--dsw-alias-border-l4);}',
      '.dsw-mrow.on{border-color:var(--dsw-alias-state-business-primary);}',
      '.dsw-mrow input{margin:0;accent-color:var(--dsw-alias-state-business-primary);width:15px;height:15px;flex-shrink:0;}',
      '.dsw-minfo{flex:1;min-width:0;}',
      '.dsw-mname{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dsw-msub{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      /* 历史记录 */
      '.dsw-hist{display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto;}',
      '.dsw-hrow{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid transparent;background:transparent;border-radius:7px;padding:7px 8px;}',
      '.dsw-hrow:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dsw-hrow.on{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2);}',
      '.dsw-htopic{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.dsw-htime{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      /* 状态与提示 */
      '.dsw-err{font-size:12px;line-height:1.45;color:var(--dsw-alias-state-error-primary);padding:7px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-left-width:2.5px;border-radius:7px;background:var(--dsw-alias-bg-layer-1);}',
      '.dsw-hint{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary);}',
      '.dsw-st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;}',
      '.dsw-st i{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex-shrink:0;}',
      '.dsw-st.run i{background:var(--dsw-alias-state-business-primary);animation:dsw-pulse 1.4s ease-in-out infinite;}',
      '.dsw-st.ok i{background:#10b981;}',
      '.dsw-st.bad i{background:var(--dsw-alias-state-error-primary);}',
      '@keyframes dsw-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}',
      /* 空状态引导 */
      '.dsw-empty{max-width:520px;margin:5vh auto 0;display:flex;flex-direction:column;gap:12px;}',
      '.dsw-empty h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-0.01em;}',
      '.dsw-empty p{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);}',
      '.dsw-empty-steps{display:flex;flex-direction:column;margin-top:6px;border-top:1px solid var(--dsw-alias-border-l2);}',
      '.dsw-es{display:flex;gap:12px;padding:12px 2px;border-bottom:1px solid var(--dsw-alias-border-l2);}',
      '.dsw-es i{font-style:normal;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);padding-top:1px;}',
      '.dsw-es b{display:block;font-size:12.5px;font-weight:600;margin-bottom:2px;}',
      '.dsw-es span{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);}',
      /* 运行视图 Header */
      '.dsw-runh{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.dsw-runh h2{margin:0 0 5px;font-size:15px;font-weight:600;line-height:1.4;}',
      '.dsw-runmeta{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;font-variant-numeric:tabular-nums;}',
      '.dsw-runmeta em{font-style:normal;color:var(--dsw-alias-label-secondary);}',
      '.dsw-runacts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      /* 流水线 Rail */
      '.dsw-rail{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative;}',
      '.dsw-rail::before{content:"";position:absolute;left:0;right:0;top:5px;height:1px;background:var(--dsw-alias-border-l2);}',
      '.dsw-rs{position:relative;padding:14px 8px 0 0;}',
      '.dsw-rs i{display:block;width:10px;height:10px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-base);margin-bottom:6px;position:relative;}',
      '.dsw-rs.act i{border-color:var(--dsw-alias-state-business-primary);}',
      '.dsw-rs.act i::after{content:"";position:absolute;inset:2px;border-radius:50%;background:var(--dsw-alias-state-business-primary);animation:dsw-pulse 1.4s ease-in-out infinite;}',
      '.dsw-rs.ok i{border-color:#10b981;background:#10b981;}',
      '.dsw-rs b{display:block;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dsw-rs span{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:2px;font-variant-numeric:tabular-nums;}',
      /* 内容 Tabs */
      '.dsw-tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2);overflow-x:auto;-webkit-overflow-scrolling:touch;}',
      '.dsw-tabs button{border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:8px 11px 9px;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;}',
      '.dsw-tabs button:hover{color:var(--dsw-alias-label-primary);}',
      '.dsw-tabs button.on{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--dsw-alias-state-business-primary);}',
      '.dsw-tabs button em{font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:4px;font-variant-numeric:tabular-nums;}',
      /* 视觉配图卡片 */
      '.dsw-img-card{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;margin-bottom:12px;}',
      '.dsw-img-h{padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
      '.dsw-img-box{position:relative;width:100%;max-height:380px;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;}',
      '.dsw-img-box img{width:100%;height:auto;max-height:380px;object-fit:contain;display:block;}',
      '.dsw-img-desc{padding:9px 12px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.45;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);}',
      /* 核心卡片容器 */
      '.dsw-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:10px;}',
      '.dsw-card.final{border-color:var(--dsw-alias-border-l3);border-top:2.5px solid #10b981;}',
      '.dsw-card-h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}',
      '.dsw-card-h h3{margin:0;font-size:13.5px;font-weight:600;}',
      '.dsw-card-h .sub{font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400;margin-left:6px;}',
      '.dsw-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
      '.dsw-cgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;}',
      '.dsw-cmeta{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}',
      '.dsw-prose{white-space:pre-wrap;word-break:break-word;margin:0;font-size:13px;line-height:1.68;color:var(--dsw-alias-label-primary);max-height:340px;overflow-y:auto;}',
      '.dsw-prose.full{max-height:none;}',
      /* Markdown 样式 */
      '.dsw-md{font-size:13px;line-height:1.72;color:var(--dsw-alias-label-primary);word-break:break-word;}',
      '.dsw-md h1{margin:16px 0 8px;font-size:18px;font-weight:700;padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-border-l2);}',
      '.dsw-md h2{margin:15px 0 7px;font-size:15px;font-weight:650;padding-bottom:5px;border-bottom:1px solid var(--dsw-alias-border-l2);}',
      '.dsw-md h3{margin:13px 0 5px;font-size:13.5px;font-weight:600;}',
      '.dsw-md h4{margin:11px 0 4px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary);}',
      '.dsw-md p{margin:6px 0;}',
      '.dsw-md ul{margin:6px 0 8px;padding-left:18px;}',
      '.dsw-md li{margin:3px 0;}',
      '.dsw-md blockquote{margin:8px 0;padding:6px 11px;border-left:2.5px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover);border-radius:0 6px 6px 0;color:var(--dsw-alias-label-secondary);}',
      '.dsw-md blockquote p{margin:0;}',
      '.dsw-md hr{border:none;border-top:1px solid var(--dsw-alias-border-l2);margin:14px 0;}',
      '.dsw-md code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);}',
      '.dsw-md strong{font-weight:650;}',
      '.dsw-cb{margin:8px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;overflow:hidden;background:var(--dsw-alias-bg-base);}',
      '.dsw-cb-h{padding:4px 9px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
      '.dsw-cb pre{margin:0;padding:9px 11px;overflow-x:auto;font-size:12px;line-height:1.55;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
      '.dsw-tbl{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;}',
      '.dsw-tbl th,.dsw-tbl td{border:1px solid var(--dsw-alias-border-l3);padding:5px 8px;text-align:left;}',
      '.dsw-tbl th{background:var(--dsw-alias-interactive-bg-hover);font-weight:600;}',
      /* 思考过程折叠 */
      '.dsw-think{font-size:11.5px;color:var(--dsw-alias-label-tertiary);}',
      '.dsw-think summary{cursor:pointer;user-select:none;list-style:none;display:inline-flex;align-items:center;gap:5px;}',
      '.dsw-think summary::before{content:"";width:0;height:0;border-left:4px solid currentColor;border-top:3px solid transparent;border-bottom:3px solid transparent;}',
      '.dsw-think summary::-webkit-details-marker{display:none;}',
      '.dsw-think[open] summary::before{transform:rotate(90deg);}',
      '.dsw-think pre{margin-top:6px;font-size:11.5px;line-height:1.6;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);}',
      /* Markdown 预览模态框 */
      '.dsw-mask{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;}',
      '.dsw-modal{width:100%;max-width:1040px;height:86vh;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l3);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.4);}',
      '.dsw-mh{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}',
      '.dsw-mt{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}',
      '.dsw-mt b{font-size:13px;font-weight:600;white-space:nowrap;}',
      '.dsw-mpath{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;padding:2px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;color:var(--dsw-alias-label-tertiary);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dsw-mb{flex:1;min-height:0;overflow-y:auto;padding:18px 22px;-webkit-overflow-scrolling:touch;}',
      '.dsw-split{display:grid;grid-template-columns:1fr 1fr;gap:14px;height:100%;min-height:0;}',
      '.dsw-pane{min-height:0;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:14px;background:var(--dsw-alias-bg-layer-1);}',
      '.dsw-pane-t{font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);margin-bottom:8px;}',
      '.dsw-seg{display:flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);}',
      '.dsw-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;padding:3px 8px;border-radius:5px;}',
      '.dsw-seg button.on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.1);border:1px solid var(--dsw-alias-border-l2);}',

      /* ===== 针对 H5 / 移动端 (< 768px) 的响应式核心规则 ===== */
      '@media (max-width: 768px){',
      '  .dsw-top-sub{display:none;}',
      '  .dsw-top-r{display:none;}',
      '  .dsw-h5-tabs{display:inline-flex;}',
      '  /* 手机端将网格改为单列自由切换 */',
      '  .dsw-body{display:flex;flex-direction:column;position:relative;}',
      '  .dsw-body.h5-show-side .dsw-side{display:flex;}',
      '  .dsw-body.h5-show-side .dsw-main{display:none;}',
      '  .dsw-body.h5-show-main .dsw-side{display:none;}',
      '  .dsw-body.h5-show-main .dsw-main{display:flex;}',
      '  .dsw-side{border-right:none;padding:14px 14px 90px;gap:16px;}',
      '  .dsw-main{padding:14px 14px 80px;gap:14px;}',
      //   /* 手机端底部吸底操作栏 (让开始按钮随手可点) */
      '  .dsw-h5-bottom-bar{position:fixed;left:0;right:0;bottom:0;padding:8px 12px calc(8px + env(safe-area-inset-bottom, 0px));background:var(--dsw-alias-bg-base);border-top:1px solid var(--dsw-alias-border-l2);box-shadow:0 -4px 16px rgba(0,0,0,0.15);z-index:90;display:flex;gap:8px;}',
      //   /* 手机端按钮触控区域放大 */
      '  .dsw-strat button{padding:10px 4px;min-height:44px;}',
      '  .dsw-mrow{padding:9px 10px;min-height:46px;}',
      '  .dsw-rail{grid-template-columns:repeat(2,1fr);row-gap:10px;}',
      '  .dsw-cgrid{grid-template-columns:1fr;}',
      //   /* 移动端全屏弹窗 */
      '  .dsw-mask{padding:0;}',
      '  .dsw-modal{width:100%;height:100%;max-width:none;border-radius:0;border:none;}',
      '  .dsw-split{grid-template-columns:1fr;height:auto;}',
      '  .dsw-mpath{display:none;}',
      '}',
    ].join('\n')

    function installCss() {
      var id = 'dsh-plugin-writer/panel'
      var existing = document.querySelector('style[data-plugin-css="' + id + '"]')
      if (existing) { existing.textContent = CSS; return }
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-plugin-writer'
      tag.dataset.pluginCss = id
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    function statusInfo(status, kind) {
      if (status === 'pending') return { text: '等待', cls: '' }
      if (status === 'running') return { text: kind === 'judge' ? '评审中' : kind === 'final' ? '提炼中' : kind === 'image' ? '配图中' : kind === 'cand' ? '撰写中' : '进行中', cls: 'run' }
      if (status === 'judging') return { text: '评审中', cls: 'run' }
      if (status === 'done') return { text: '已完成', cls: 'ok' }
      if (status === 'failed') return { text: '失败', cls: 'bad' }
      if (status === 'cancelled') return { text: '已取消', cls: '' }
      return { text: status || '未知', cls: '' }
    }

    function Status(props) {
      var info = statusInfo(props.status, props.kind)
      return h('span', { className: 'dsw-st ' + info.cls }, h('i', null), info.text)
    }

    function formatDuration(startedAt, finishedAt) {
      if (!startedAt) return ''
      var end = finishedAt || Date.now()
      var sec = Math.max(0.1, (end - startedAt) / 1000)
      return sec.toFixed(1) + 's'
    }

    function formatClock(ts) {
      if (!ts) return ''
      var d = new Date(ts)
      function pad(n) { return (n < 10 ? '0' : '') + n }
      return pad(d.getHours()) + ':' + pad(d.getMinutes())
    }

    function api(path, options) {
      return fetch(path, Object.assign({ credentials: 'same-origin', headers: { accept: 'application/json' } }, options || {})).then(function (res) {
        return res.json().catch(function () { return null }).then(function (data) {
          if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
          return data
        })
      })
    }

    function post(path, body) {
      return api(path, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    }

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
      return new Promise(function (resolve, reject) {
        var area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', 'true')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        var ok = document.execCommand('copy')
        area.remove()
        if (ok) resolve()
        else reject(new Error('复制失败'))
      })
    }

    function downloadMarkdown(filename, content) {
      var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
      var url = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
    }

    function modelKey(model) { return model.provider + '/' + model.id }
    function isImageName(model) { return /image|imagine/i.test(model.id) || Boolean(model.hint) }

    function loadDraft() { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') } catch (e) { return null } }
    function saveDraft(draft) { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch (e) {} }

    function defaultSelection(models) {
      var keys = models.map(modelKey)
      var picked = PREFERRED.filter(function (key) { return keys.indexOf(key) !== -1 }).slice(0, 3)
      if (picked.length < 2) picked = models.filter(function (m) { return !isImageName(m) }).slice(0, 3).map(modelKey)
      var judge = JUDGE_PREFERRED.filter(function (key) { return keys.indexOf(key) !== -1 })[0] || picked[0] || keys[0] || ''
      return { picked: picked, judge: judge }
    }

    function Markdown(props) {
      var text = String(props.text || '')
      if (!text.trim()) {
        return h('p', { className: 'dsw-hint' }, props.empty || '暂无内容')
      }
      if (MdHost) {
        return h(MdHost, {
          text: text,
          streaming: Boolean(props.streaming),
          labels: MD_LABELS,
          variant: props.compact ? 'compact' : 'body',
        })
      }
      return LegacyMarkdown(props)
    }

    function renderInline(text) {
      var parts = []
      var regex = /(\*\*[^*]+\*\*|\x60[^\x60]+\x60)/g
      var lastIndex = 0
      var match
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
        var token = match[0]
        if (token.slice(0, 2) === '**') parts.push(h('strong', { key: match.index }, token.slice(2, -2)))
        else parts.push(h('code', { key: match.index }, token.slice(1, -1)))
        lastIndex = regex.lastIndex
      }
      if (lastIndex < text.length) parts.push(text.slice(lastIndex))
      return parts.length ? parts : text
    }

    function LegacyMarkdown(props) {
      var lines = String(props.text || '').split('\n')
      var blocks = []
      var list = null
      var inCode = false
      var codeLang = ''
      var codeLines = []
      var tableRows = []
      function flushList() {
        if (list) { blocks.push(h('ul', { key: 'l' + blocks.length }, list)); list = null }
      }
      function flushTable() {
        if (tableRows.length > 0) {
          var header = tableRows[0]
          var bodyRows = tableRows.slice(1).filter(function (r) { return !r.every(function (cell) { return /^[-:\s]*$/.test(cell) }) })
          blocks.push(h('table', { key: 't' + blocks.length, className: 'dsw-tbl' },
            h('thead', null, h('tr', null, header.map(function (c, i) { return h('th', { key: i }, renderInline(c)) }))),
            h('tbody', null, bodyRows.map(function (r, ri) { return h('tr', { key: ri }, r.map(function (c, ci) { return h('td', { key: ci }, renderInline(c)) })) }))))
          tableRows = []
        }
      }
      function flushAll() { flushList(); flushTable() }
      lines.forEach(function (line) {
        var trimmed = line.trim()
        if (trimmed.indexOf('\x60\x60\x60') === 0) {
          flushAll()
          if (!inCode) { inCode = true; codeLang = trimmed.slice(3).trim(); codeLines = [] }
          else {
            blocks.push(h('div', { key: 'c' + blocks.length, className: 'dsw-cb' },
              codeLang ? h('div', { className: 'dsw-cb-h' }, codeLang) : null,
              h('pre', null, codeLines.join('\n'))))
            inCode = false; codeLang = ''; codeLines = []
          }
          return
        }
        if (inCode) { codeLines.push(line); return }
        if (trimmed.charAt(0) === '|' && trimmed.charAt(trimmed.length - 1) === '|' && trimmed.length > 2) {
          flushList()
          tableRows.push(trimmed.slice(1, -1).split('|').map(function (c) { return c.trim() }))
          return
        }
        flushTable()
        if (!trimmed) { flushAll(); return }
        if (/^---+$/.test(trimmed)) { flushAll(); blocks.push(h('hr', { key: 'h' + blocks.length })); return }
        if (trimmed.charAt(0) === '>') { flushAll(); blocks.push(h('blockquote', { key: 'b' + blocks.length }, renderInline(trimmed.replace(/^>\s?/, '')))); return }
        if (trimmed.charAt(0) === '-' || trimmed.charAt(0) === '*' || /^\d+\.\s/.test(trimmed)) {
          if (!list) list = []
          list.push(h('li', { key: list.length }, renderInline(trimmed.replace(/^([-*]|\d+\.)\s?/, ''))))
          return
        }
        flushAll()
        if (trimmed.indexOf('#### ') === 0) blocks.push(h('h4', { key: blocks.length }, renderInline(trimmed.slice(5))))
        else if (trimmed.indexOf('### ') === 0) blocks.push(h('h3', { key: blocks.length }, renderInline(trimmed.slice(4))))
        else if (trimmed.indexOf('## ') === 0) blocks.push(h('h2', { key: blocks.length }, renderInline(trimmed.slice(3))))
        else if (trimmed.indexOf('# ') === 0) blocks.push(h('h1', { key: blocks.length }, renderInline(trimmed.slice(2))))
        else blocks.push(h('p', { key: blocks.length }, renderInline(line)))
      })
      flushAll()
      if (inCode && codeLines.length) blocks.push(h('div', { key: 'ct', className: 'dsw-cb' }, h('pre', null, codeLines.join('\n'))))
      if (!blocks.length) return h('p', { className: 'dsw-hint' }, props.empty || '暂无内容')
      return h('div', { className: 'dsw-md' }, blocks)
    }

    function Think(props) {
      if (!props.text) return null
      return h('details', { className: 'dsw-think' },
        h('summary', null, '思考过程', h('span', { style: { marginLeft: '6px', opacity: 0.7 } }, props.text.length + ' 字')),
        h('pre', null, props.text))
    }

    function WriterIcon(props) {
      var s = props.size || 18
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M5 7h14M5 12h10M5 17h7', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' }))
    }
    function WriterPage() {
      var draft = useRef(loadDraft() || {})
      var modelsS = useState([]); var models = modelsS[0]; var setModels = modelsS[1]
      var catalogErrorS = useState(''); var catalogError = catalogErrorS[0]; var setCatalogError = catalogErrorS[1]
      var topicS = useState(draft.current.topic || ''); var topic = topicS[0]; var setTopic = topicS[1]
      var prevTopicS = useState(''); var prevTopic = prevTopicS[0]; var setPrevTopic = prevTopicS[1]
      var focusS = useState(draft.current.focus || ''); var focus = focusS[0]; var setFocus = focusS[1]
      var strategyS = useState(draft.current.strategy || 'distill'); var strategy = strategyS[0]; var setStrategy = strategyS[1]
      var pickedS = useState(draft.current.picked || []); var picked = pickedS[0]; var setPicked = pickedS[1]
      var judgeS = useState(draft.current.judge || ''); var judge = judgeS[0]; var setJudge = judgeS[1]
      var imageModelS = useState(draft.current.imageModel || 'local-proxy/gemini-3-pro-image'); var imageModel = imageModelS[0]; var setImageModel = imageModelS[1]
      var searchS = useState(''); var search = searchS[0]; var setSearch = searchS[1]
      var optModeS = useState('expand'); var optMode = optModeS[0]; var setOptMode = optModeS[1]
      var optimizingS = useState(false); var optimizing = optimizingS[0]; var setOptimizing = optimizingS[1]
      var optResultS = useState(null); var optResult = optResultS[0]; var setOptResult = optResultS[1]
      var seeded = useRef(Boolean(draft.current.picked && draft.current.picked.length))
      var runsS = useState([]); var runs = runsS[0]; var setRuns = runsS[1]
      var activeS = useState(null); var active = activeS[0]; var setActive = activeS[1]
      var formErrorS = useState(''); var formError = formErrorS[0]; var setFormError = formErrorS[1]
      var startingS = useState(false); var starting = startingS[0]; var setStarting = startingS[1]
      var copiedS = useState(''); var copied = copiedS[0]; var setCopied = copiedS[1]
      /* 移动端视图控制: 'side' (配置) 或 'main' (成果) */
      var h5ViewS = useState('side'); var h5View = h5ViewS[0]; var setH5View = h5ViewS[1]

      useEffect(function () {
        installCss()
        var originalTitle = document.title
        var brand = originalTitle.split(' — ').pop() || 'DSH'
        document.title = '写作 — ' + brand
        var stop = false
        api('/api/writer/models').then(function (data) {
          if (stop) return
          var next = data.models || []
          setModels(next)
          setCatalogError((data.errors || []).map(function (item) { return item.provider + ': ' + item.message }).join('；'))
          var known = {}
          next.forEach(function (m) { known[modelKey(m)] = true })
          setPicked(function (cur) { return cur.filter(function (k) { return known[k] }) })
          setJudge(function (cur) { return known[cur] ? cur : '' })
          if (!seeded.current) {
            var defs = defaultSelection(next)
            setPicked(defs.picked)
            setJudge(defs.judge)
            seeded.current = true
          }
        }).catch(function (err) { if (!stop) setCatalogError(err.message) })
        api('/api/writer/runs').then(function (data) { if (!stop) setRuns(data.runs || []) }).catch(function () {})
        return function () {
          stop = true
          document.title = originalTitle
        }
      }, [])

      useEffect(function () {
        var scroller = document.querySelector('.dsw-body.h5-show-main .dsw-main, .dsw-body.h5-show-side .dsw-side')
        if (scroller) scroller.scrollTop = 0
      }, [h5View])

      useEffect(function () {
        saveDraft({ topic: topic, focus: focus, strategy: strategy, picked: picked, judge: judge, imageModel: imageModel })
      }, [topic, focus, strategy, picked, judge, imageModel])

      useEffect(function () {
        if (!active || (active.status !== 'running' && active.status !== 'judging')) return undefined
        var stop = false
        var timer = setInterval(function () {
          api('/api/writer/runs/' + encodeURIComponent(active.id)).then(function (data) {
            if (stop || !data.run) return
            setActive(data.run)
            if (data.run.status !== 'running' && data.run.status !== 'judging') {
              api('/api/writer/runs').then(function (list) { if (!stop) setRuns(list.runs || []) }).catch(function () {})
            }
          }).catch(function () {})
        }, 700)
        return function () { stop = true; clearInterval(timer) }
      }, [active && active.id, active && active.status])

      var grouped = useMemo(function () {
        var q = search.trim().toLowerCase()
        var groups = []
        var index = {}
        models.forEach(function (model) {
          var key = modelKey(model)
          if (q && key.toLowerCase().indexOf(q) === -1 && (model.name || '').toLowerCase().indexOf(q) === -1) return
          if (!index[model.provider]) { index[model.provider] = { provider: model.provider, models: [] }; groups.push(index[model.provider]) }
          index[model.provider].models.push(model)
        })
        return groups
      }, [models, search])

      function toggle(key) {
        setPicked(function (cur) {
          if (cur.indexOf(key) !== -1) return cur.filter(function (k) { return k !== key })
          if (cur.length >= 5) return cur
          return cur.concat(key)
        })
      }

      function handleOptimize() {
        setFormError('')
        if (!topic.trim()) { setFormError('请先输入初步的题目或想法，再使用 AI 优化'); return }
        setOptimizing(true)
        post('/api/writer/optimize', { topic: topic, focus: focus, mode: optMode, modelKey: judge || picked[0] || '' })
          .then(function (res) { setOptResult(res) })
          .catch(function (err) { setFormError('AI 优化失败：' + err.message) })
          .then(function () { setOptimizing(false) })
      }

      function applyOptimized(withFocus) {
        if (!optResult) return
        setPrevTopic(topic)
        setTopic(optResult.optimizedTopic || topic)
        if (withFocus && optResult.suggestedFocus) setFocus(optResult.suggestedFocus)
        setOptResult(null)
      }

      function start() {
        setFormError('')
        if (!topic.trim()) { setFormError('请先填写创作命题'); return }
        if (picked.length < 2) { setFormError('至少选择 2 个候选模型'); return }
        if (!judge) { setFormError('请指定裁判模型'); return }
        var byKey = {}
        models.forEach(function (m) { byKey[modelKey(m)] = m })
        var chosen = picked.map(function (k) { return byKey[k] }).filter(Boolean)
        var judgeModel = byKey[judge]
        if (chosen.length < 2) { setFormError('部分选中的模型已不在目录中，请重新选择'); return }
        if (!judgeModel) { setFormError('裁判模型已不在目录中，请重新选择'); return }
        var imgModelObj = null
        if (imageModel) {
          var im = byKey[imageModel]
          if (im) imgModelObj = { provider: im.provider, model: im.id }
        }
        setStarting(true)
        post('/api/writer/runs', {
          topic: topic,
          focus: focus,
          strategy: strategy,
          models: chosen.map(function (m) { return { provider: m.provider, model: m.id } }),
          judge: { provider: judgeModel.provider, model: judgeModel.id },
          imageModel: imgModelObj,
        }).then(function (data) {
          setActive(data.run)
          setRuns(function (cur) {
            return [{ id: data.run.id, topic: data.run.topic, status: data.run.status, createdAt: data.run.createdAt, strategy: data.run.strategy }].concat(cur.filter(function (r) { return r.id !== data.run.id }))
          })
          /* 手机端发起任务后自动平滑切换到成果视图 */
          setH5View('main')
        }).catch(function (err) { setFormError(err.message) }).then(function () { setStarting(false) })
      }

      function openRun(id) {
        api('/api/writer/runs/' + encodeURIComponent(id)).then(function (data) {
          setActive(data.run)
          /* 手机端点击历史任务时自动切到成果视图 */
          setH5View('main')
        }).catch(function (err) { setFormError(err.message) })
      }

      function cancel() {
        if (!active) return
        post('/api/writer/runs/' + encodeURIComponent(active.id) + '/cancel').then(function (data) { setActive(data.run) }).catch(function (err) { setFormError(err.message) })
      }

      function doCopy(text, id) {
        copyText(text).then(function () {
          setCopied(id)
          setTimeout(function () { setCopied('') }, 1600)
        }).catch(function (err) { setFormError(err.message) })
      }

      var live = active && (active.status === 'running' || active.status === 'judging')
      var stratObj = STRATEGIES.filter(function (s) { return s.id === strategy })[0] || STRATEGIES[0]
      var h5Cls = 'dsw-body' + (active ? ' viewing' : '') + (h5View === 'side' ? ' h5-show-side' : ' h5-show-main')
      var headerChildren = []
      var sideChildren = []
      var mainChildren = []

      headerChildren.push(
        h('div', { className: 'dsw-top-l' },
          h('div', { className: 'dsw-top-title' }, '写作'),
          h('div', { className: 'dsw-top-sub' }, '多模型并行撰写 · 裁判交叉评审 · 提炼终稿')),
        h('div', { className: 'dsw-h5-tabs' },
          h('button', {
            type: 'button',
            className: 'dsw-h5-tab' + (h5View === 'side' ? ' on' : ''),
            onClick: function () { setH5View('side') },
          }, '配置'),
          h('button', {
            type: 'button',
            className: 'dsw-h5-tab' + (h5View === 'main' ? ' on' : ''),
            onClick: function () { setH5View('main') },
          }, live ? '生成中' : '成果')),
        h('div', { className: 'dsw-top-r' },
          h('span', null, '模型 ', h('b', null, String(models.length))),
          h('span', null, '已选 ', h('b', null, picked.length + '/5'))))

      var header = h('header', { className: 'dsw-top' }, headerChildren)

      return h(
        'div',
        { className: 'dsw-writer' },
        header,
        h('div', { className: h5Cls },
          h('aside', { className: 'dsw-side' },

            h('div', { className: 'dsw-sec' },
              h('div', { className: 'dsw-sec-h' },
                h('span', { className: 'dsw-sec-t' }, h('i', null, '01'), '创作命题'),
                h('span', { className: 'dsw-count' }, topic.trim().length + ' 字')),
              h('div', { className: 'dsw-tpl' },
                TEMPLATES.map(function (tpl, i) {
                  return h('button', { key: i, type: 'button', onClick: function () { setTopic(tpl.topic); setFocus(tpl.focus); setStrategy(tpl.strategy) } }, tpl.label)
                })),
              h('textarea', {
                className: 'dsw-field',
                value: topic,
                placeholder: '用一句话描述要产出的主题，或先写几行草稿。',
                onChange: function (e) { setTopic(e.target.value) },
                onKeyDown: function (e) { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') start() },
              }),
              h('div', { className: 'dsw-topic-bar' },
                h('div', { className: 'dsw-topic-bar-l' },
                  h('select', { className: 'dsw-modesel', value: optMode, onChange: function (e) { setOptMode(e.target.value) } },
                    OPTIMIZE_MODES.map(function (m) { return h('option', { key: m.id, value: m.id }, m.label) })),
                  h('button', { type: 'button', className: 'dsw-ai', disabled: optimizing || !topic.trim(), onClick: handleOptimize }, optimizing ? '优化中' : 'AI 优化')),
                prevTopic ? h('button', { type: 'button', className: 'dsw-ghost', style: { padding: '5px 8px', fontSize: '12px' }, onClick: function () { setTopic(prevTopic); setPrevTopic('') } }, '还原') : null),

            optResult ? h('div', { className: 'dsw-ai-card' },
              h('div', { className: 'dsw-ai-h' },
                h('span', { className: 'dsw-ai-t' }, 'AI 优化建议', h('span', null, optResult.modelName || optResult.model || '')),
                h('button', { type: 'button', className: 'dsw-ghost', style: { padding: '2px 7px', fontSize: '12px' }, onClick: function () { setOptResult(null) } }, '关闭')),
              h('div', { className: 'dsw-ai-body' }, optResult.optimizedTopic),
              optResult.improvements && optResult.improvements.length ? h('div', { className: 'dsw-ai-imp' },
                optResult.improvements.map(function (imp, i) { return h('div', { key: i }, imp) })) : null,
              optResult.suggestedFocus ? h('div', { className: 'dsw-ai-focus' }, '建议侧重：', h('b', null, optResult.suggestedFocus)) : null,
              h('div', { className: 'dsw-ai-acts' },
                h('button', { type: 'button', className: 'dsw-btn', onClick: function () { applyOptimized(false) } }, '仅采纳命题'),
                h('button', { type: 'button', className: 'dsw-btn', onClick: function () { applyOptimized(true) } }, '采纳命题与侧重'))) : null,

            h('div', { className: 'dsw-sec' },
              h('span', { className: 'dsw-sec-t' }, h('i', null, '02'), '评审侧重（可选）'),
              h('input', {
                className: 'dsw-field',
                type: 'text',
                value: focus,
                placeholder: '例如：面向工程落地，须包含可执行建议',
                onChange: function (e) { setFocus(e.target.value) },
              })),

            h('div', { className: 'dsw-sec' },
              h('span', { className: 'dsw-sec-t' }, h('i', null, '03'), '整合策略'),
              h('div', { className: 'dsw-strat' },
                STRATEGIES.map(function (item) {
                  return h('button', {
                    key: item.id,
                    type: 'button',
                    className: item.id === strategy ? 'on' : '',
                    onClick: function () { setStrategy(item.id) },
                  }, h('b', null, item.label))
                })),
              h('div', { className: 'dsw-hint' }, stratObj.desc)),

            h('div', { className: 'dsw-sec' },
              h('div', { className: 'dsw-sec-h' },
                h('span', { className: 'dsw-sec-t' }, h('i', null, '04'), '撰稿模型'),
                h('span', { className: 'dsw-sec-n' }, picked.length + ' / 5')),
              h('div', { className: 'dsw-mbar' },
                h('input', { className: 'dsw-field', type: 'text', value: search, placeholder: '搜索模型', onChange: function (e) { setSearch(e.target.value) } }),
                h('button', { type: 'button', className: 'dsw-ghost', style: { padding: '6px 8px', fontSize: '12px' }, onClick: function () { setPicked(defaultSelection(models).picked) } }, '推荐'),
                h('button', { type: 'button', className: 'dsw-ghost', style: { padding: '6px 8px', fontSize: '12px' }, onClick: function () { setPicked([]) } }, '清空')),
              catalogError ? h('div', { className: 'dsw-hint' }, catalogError) : null,
              h('div', { className: 'dsw-models' },
                grouped.map(function (group) {
                  return h('div', { key: group.provider },
                    h('div', { className: 'dsw-prov' }, h('span', null, group.provider), h('span', null, String(group.models.length))),
                    group.models.map(function (model) {
                      var key = modelKey(model)
                      var on = picked.indexOf(key) !== -1
                      return h('label', { key: key, className: 'dsw-mrow' + (on ? ' on' : '') },
                        h('input', { type: 'checkbox', checked: on, onChange: function () { toggle(key) } }),
                        h('div', { className: 'dsw-minfo' },
                          h('div', { className: 'dsw-mname' }, model.name),
                          h('div', { className: 'dsw-msub' }, key + (model.hint ? ' · ' + model.hint : ''))))
                    }))
                }))),

            h('div', { className: 'dsw-sec' },
              h('span', { className: 'dsw-sec-t' }, h('i', null, '05'), '裁判模型'),
              h('select', { className: 'dsw-field', value: judge, onChange: function (e) { setJudge(e.target.value) } },
                h('option', { value: '' }, '选择裁判'),
                models.filter(function (m) { return !isImageName(m) }).map(function (model) {
                  var key = modelKey(model)
                  return h('option', { key: key, value: key }, model.name + ' · ' + model.provider)
                }))),

            h('div', { className: 'dsw-sec' },
              h('div', { className: 'dsw-sec-h' },
                h('span', { className: 'dsw-sec-t' }, h('i', null, '06'), '视觉总览配图 (可选)'),
                imageModel ? h('button', { type: 'button', className: 'dsw-ghost', style: { padding: '2px 6px', fontSize: '11px' }, onClick: function () { setImageModel('') } }, '不生图') : null),
              h('select', { className: 'dsw-field', value: imageModel, onChange: function (e) { setImageModel(e.target.value) } },
                h('option', { value: '' }, '不生成视觉总览配图'),
                models.filter(function (m) { return isImageName(m) }).map(function (model) {
                  var key = modelKey(model)
                  return h('option', { key: key, value: key }, model.name + ' (' + model.provider + ')')
                }))),

            formError ? h('div', { className: 'dsw-err' }, formError) : null,

            /* 桌面端：开始按钮随内容排列 */
            h('div', { className: 'dsw-h5-desktop-actions' },
              live || starting
                ? h('button', { type: 'button', className: 'dsw-stop', disabled: starting, onClick: cancel }, '停止当前任务')
                : h('button', { type: 'button', className: 'dsw-primary', onClick: start }, '开始写作')),

            h('div', { className: 'dsw-sec' },
              h('div', { className: 'dsw-sec-h' },
                h('span', { className: 'dsw-sec-t' }, '历史记录'),
                h('span', { className: 'dsw-sec-n' }, String(runs.length))),
              h('div', { className: 'dsw-hist' },
                runs.length === 0
                  ? h('div', { className: 'dsw-hint' }, '暂无历史任务')
                  : runs.map(function (run) {
                      var info = statusInfo(run.status)
                      return h('button', {
                        key: run.id,
                        type: 'button',
                        className: 'dsw-hrow' + (active && active.id === run.id ? ' on' : ''),
                        onClick: function () { openRun(run.id) },
                      },
                        h('span', { className: 'dsw-st ' + info.cls }, h('i', null)),
                        h('span', { className: 'dsw-htopic' }, run.topic),
                        h('span', { className: 'dsw-htime' }, formatClock(run.createdAt)))
                    })))),),
          h('section', { className: 'dsw-main' },
            !active
              ? h('div', { className: 'dsw-empty' },
                  h('h2', null, '多模型独立成稿，裁判取精去糟'),
                  h('p', null, '在配置页输入命题（可先用 AI 优化补全维度），选择 2 至 5 个撰稿模型与一位裁判。完成后可在此查看每个模型的原始稿件、裁判的交叉评审与取舍清单，以及最终提炼的终稿。'),
                  h('div', { className: 'dsw-empty-steps' },
                    h('div', { className: 'dsw-es' }, h('i', null, '01'), h('div', null, h('b', null, 'AI 命题优化'), h('span', null, '把简短想法扩写为背景清晰、维度完整的专业命题。'))),
                    h('div', { className: 'dsw-es' }, h('i', null, '02'), h('div', null, h('b', null, '多模型独立盲写'), h('span', null, '多个模型并行撰稿，互不可见，充分暴露差异与盲区。'))),
                    h('div', { className: 'dsw-es' }, h('i', null, '03'), h('div', null, h('b', null, '裁判交叉评审与提炼'), h('span', null, '逐稿标注精华与硬伤，剔除幻觉与套话，融合为终稿并留存完整中间过程。')))))
              : h(RunView, { run: active, copied: copied, onCopy: doCopy, onBackToConfig: function () { setH5View('side') } }))),

        h('div', { className: 'dsw-h5-bottom-bar' },
          h5View === 'side'
            ? (live || starting
                ? h('button', { type: 'button', className: 'dsw-stop', style: { width: '100%' }, disabled: starting, onClick: cancel }, '停止当前任务')
                : h('button', { type: 'button', className: 'dsw-primary', style: { width: '100%' }, onClick: start }, '开始写作'))
            : h('button', { type: 'button', className: 'dsw-btn', style: { width: '100%', minHeight: '42px' }, onClick: function () { setH5View('side') } }, '返回调整配置'))
      )
    }

    function RunView(props) {
      var run = props.run
      var tabS = useState('all'); var tab = tabS[0]; var setTab = tabS[1]
      var finalModeS = useState('render'); var finalMode = finalModeS[0]; var setFinalMode = finalModeS[1]
      var expandedS = useState({}); var expanded = expandedS[0]; var setExpanded = expandedS[1]
      var previewS = useState(null); var preview = previewS[0]; var setPreview = previewS[1]
      var pmodeS = useState('render'); var pmode = pmodeS[0]; var setPmode = pmodeS[1]

      useEffect(function () {
        if (!preview) return undefined
        var onKey = function (e) { if (e.key === 'Escape') setPreview(null) }
        window.addEventListener('keydown', onKey)
        return function () { window.removeEventListener('keydown', onKey) }
      }, [preview])

      var doneCount = run.candidates.filter(function (c) { return c.status === 'done' || c.status === 'failed' || c.status === 'cancelled' }).length
      var step1Done = run.candidates.length > 0 && doneCount === run.candidates.length
      var step1Act = run.status === 'running'
      var step2Act = run.critique.status === 'running'
      var step2Done = run.critique.status === 'done'
      var step3Act = run.synthesis.status === 'running'
      var step3Done = run.synthesis.status === 'done'

      function openPreview(scope) {
        api('/api/writer/runs/' + encodeURIComponent(run.id) + '/markdown?scope=' + encodeURIComponent(scope)).then(function (doc) {
          setPreview(doc)
          setPmode('render')
        }).catch(function () {
          var fallback = scope === 'critique' ? (run.critique.text || '') : scope === 'full' ? [run.synthesis.text, run.critique.text].join('\n\n') : (run.synthesis.text || '')
          setPreview({
            id: run.id,
            scope: scope,
            fileName: run.id + '-' + scope + '.md',
            filePath: '~/.dsh/dsh-writer/outputs/' + run.id + '-' + scope + '.md',
            markdown: fallback,
          })
          setPmode('render')
        })
      }

      function toggleExpand(key) {
        setExpanded(function (prev) { var next = Object.assign({}, prev); next[key] = !prev[key]; return next })
      }

      function exportAll() {
        var parts = ['# ' + run.topic, '', run.focus ? '> 侧重：' + run.focus : '', '', '## 裁判综合终稿', '', run.synthesis.text || '（暂无）', '', '## 裁判交叉评审', '', run.critique.text || '（暂无）', '', '## 候选模型原稿', '']
        run.candidates.forEach(function (c, i) {
          parts.push('### ' + (i + 1) + '. ' + c.name)
          parts.push('')
          parts.push(c.text || '（无正文）')
          parts.push('')
        })
        downloadMarkdown(run.id + '-full.md', parts.join('\n'))
      }

      var stratLabel = (STRATEGIES.filter(function (s) { return s.id === run.strategy })[0] || STRATEGIES[0]).label

      return h(React.Fragment, null,

        /* 移动端返回配置按钮（桌面隐藏） */
        h('button', {
          type: 'button',
          className: 'dsw-h5-back',
          onClick: function () { if (props.onBackToConfig) props.onBackToConfig() },
        }, '‹ 返回配置'),

        h('div', { className: 'dsw-runh' },
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('h2', null, run.topic),
            h('div', { className: 'dsw-runmeta' },
              h(Status, { status: run.status }),
              h('span', null, '策略 ', h('em', null, stratLabel)),
              h('span', null, '裁判 ', h('em', null, run.judge ? run.judge.name : '—')),
              h('span', null, formatClock(run.createdAt)))),
          h('div', { className: 'dsw-runacts' },
            h('button', { type: 'button', className: 'dsw-btn', onClick: function () { openPreview('full') } }, '预览 Markdown'),
            h('button', { type: 'button', className: 'dsw-btn', onClick: exportAll }, '下载 .md'))),

        run.error ? h('div', { className: 'dsw-err' }, run.error) : null,

        h('div', { className: 'dsw-rail' },
          h('div', { className: 'dsw-rs' + (step1Act ? ' act' : '') + (step1Done ? ' ok' : '') },
            h('i', null), h('b', null, '多模型撰稿'), h('span', null, doneCount + ' / ' + run.candidates.length)),
          h('div', { className: 'dsw-rs' + (step2Act ? ' act' : '') + (step2Done ? ' ok' : '') },
            h('i', null), h('b', null, '交叉评审'), h('span', null, statusInfo(run.critique.status).text)),
          h('div', { className: 'dsw-rs' + (step3Act ? ' act' : '') + (step3Done ? ' ok' : '') },
            h('i', null), h('b', null, '提炼终稿'), h('span', null, statusInfo(run.synthesis.status, 'final').text)),
          h('div', { className: 'dsw-rs' + (run.status === 'done' ? ' ok' : '') },
            h('i', null), h('b', null, '交付归档'), h('span', null, run.status === 'done' ? '可预览与导出' : '—'))),

        h('div', { className: 'dsw-tabs' },
          h('button', { type: 'button', className: tab === 'all' ? 'on' : '', onClick: function () { setTab('all') } }, '全部'),
          h('button', { type: 'button', className: tab === 'final' ? 'on' : '', onClick: function () { setTab('final') } }, '终稿', run.synthesis.text ? h('em', null, String(run.synthesis.text.length)) : null),
          h('button', { type: 'button', className: tab === 'critique' ? 'on' : '', onClick: function () { setTab('critique') } }, '评审', run.critique.text ? h('em', null, String(run.critique.text.length)) : null),
          h('button', { type: 'button', className: tab === 'candidates' ? 'on' : '', onClick: function () { setTab('candidates') } }, '原稿', h('em', null, String(run.candidates.length)))),

        /* 视觉总览配图卡片 */
        (tab === 'all' || tab === 'final') && run.imageOverview ? h('div', { className: 'dsw-img-card' },
          h('div', { className: 'dsw-img-h' },
            h('span', null, '视觉总览配图 · ' + (run.imageModel ? run.imageModel.name : '生图模型')),
            h(Status, { status: run.imageOverview.status, kind: 'image' })),
          run.imageOverview.imageUrl ? h('div', { className: 'dsw-img-box' },
            h('img', { src: run.imageOverview.imageUrl, alt: run.topic, loading: 'lazy' })) : null,
          run.imageOverview.status === 'running' ? h('div', { style: { padding: '16px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' } }, '正在根据命题绘制视觉总览配图…') : null,
          run.imageOverview.error ? h('div', { className: 'dsw-err', style: { margin: '8px' } }, run.imageOverview.error) : null,
          run.imageOverview.text && !run.imageOverview.imageUrl ? h('div', { className: 'dsw-img-desc' }, run.imageOverview.text) : null) : null,

        (tab === 'all' || tab === 'final') ? h('article', { className: 'dsw-card final' },
          h('div', { className: 'dsw-card-h' },
            h('h3', null, '综合终稿', h('span', { className: 'sub' }, run.judge ? run.judge.name : '')),
            h('div', { className: 'dsw-acts' },
              h(Status, { status: run.synthesis.status, kind: 'final' }),
              run.synthesis.text ? h('button', { type: 'button', className: 'dsw-btn', onClick: function () { openPreview('final') } }, '预览 .md') : null,
              run.synthesis.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { setFinalMode(finalMode === 'render' ? 'raw' : 'render') } }, finalMode === 'render' ? '源码' : '渲染') : null,
              run.synthesis.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { downloadMarkdown(run.id + '-final.md', run.synthesis.text) } }, '下载') : null,
              run.synthesis.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { props.onCopy(run.synthesis.text, 'final') } }, props.copied === 'final' ? '已复制' : '复制') : null)),
          run.synthesis.error ? h('div', { className: 'dsw-err' }, run.synthesis.error) : null,
          finalMode === 'raw'
            ? h('pre', { className: 'dsw-prose full' }, run.synthesis.text || '（暂无源码）')
            : h(Markdown, { text: run.synthesis.text, streaming: run.synthesis.status === 'running', empty: '正在吸收各稿精华并撰写终稿' }),
          h(Think, { text: run.synthesis.reasoning })) : null,

        (tab === 'all' || tab === 'critique') ? h('article', { className: 'dsw-card' },
          h('div', { className: 'dsw-card-h' },
            h('h3', null, '交叉评审与取舍'),
            h('div', { className: 'dsw-acts' },
              h(Status, { status: run.critique.status, kind: 'judge' }),
              run.critique.text ? h('button', { type: 'button', className: 'dsw-btn', onClick: function () { openPreview('critique') } }, '预览 .md') : null,
              run.critique.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { props.onCopy(run.critique.text, 'critique') } }, props.copied === 'critique' ? '已复制' : '复制') : null)),
          run.critique.error ? h('div', { className: 'dsw-err' }, run.critique.error) : null,
          h(Markdown, { text: run.critique.text, streaming: run.critique.status === 'running', compact: true, empty: '等待候选完成撰稿后开始' }),
          h(Think, { text: run.critique.reasoning })) : null,

        (tab === 'all' || tab === 'candidates') ? h('div', { className: 'dsw-cgrid' },
          run.candidates.map(function (c) {
            var isExp = Boolean(expanded[c.key])
            var dur = formatDuration(c.startedAt, c.finishedAt)
            return h('article', { key: c.key, className: 'dsw-card' },
              h('div', { className: 'dsw-card-h' },
                h('h3', null, c.name),
                h(Status, { status: c.status, kind: 'cand' })),
              h('div', { className: 'dsw-cmeta' },
                h('span', null, c.key),
                h('span', null, [dur, c.text ? c.text.length + ' 字' : ''].filter(Boolean).join(' · '))),
              c.error ? h('div', { className: 'dsw-err' }, c.error) : null,
              h('pre', { className: 'dsw-prose' + (isExp ? ' full' : '') }, c.text || (c.status === 'running' ? '正在独立撰稿' : '暂无正文')),
              h('div', { className: 'dsw-acts', style: { justifyContent: 'flex-end' } },
                c.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { toggleExpand(c.key) } }, isExp ? '收起' : '展开') : null,
                c.text ? h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { props.onCopy(c.text, c.key) } }, props.copied === c.key ? '已复制' : '复制') : null),
              h(Think, { text: c.reasoning }))
          })) : null,

        preview ? h('div', { className: 'dsw-mask', onClick: function (e) { if (e.target === e.currentTarget) setPreview(null) } },
          h('div', { className: 'dsw-modal' },
            h('div', { className: 'dsw-mh' },
              h('div', { className: 'dsw-mt' },
                h('b', null, 'Markdown 预览'),
                h('span', { className: 'dsw-mpath', title: preview.filePath || '' }, preview.fileName + (preview.filePath ? ' · ' + preview.filePath : ''))),
              h('div', { className: 'dsw-acts' },
                h('div', { className: 'dsw-seg' },
                  h('button', { type: 'button', className: pmode === 'render' ? 'on' : '', onClick: function () { setPmode('render') } }, '渲染'),
                  h('button', { type: 'button', className: pmode === 'split' ? 'on' : '', onClick: function () { setPmode('split') } }, '分栏'),
                  h('button', { type: 'button', className: pmode === 'raw' ? 'on' : '', onClick: function () { setPmode('raw') } }, '源码')),
                h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { props.onCopy(preview.markdown, 'pv') } }, props.copied === 'pv' ? '已复制' : '复制'),
                h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { downloadMarkdown(preview.fileName, preview.markdown) } }, '下载'),
                h('button', { type: 'button', className: 'dsw-ghost', onClick: function () { setPreview(null) } }, '关闭'))),
            h('div', { className: 'dsw-mb' },
              pmode === 'render'
                ? h(Markdown, { text: preview.markdown })
                : pmode === 'raw'
                  ? h('pre', { className: 'dsw-prose full' }, preview.markdown)
                  : h('div', { className: 'dsw-split' },
                      h('div', { className: 'dsw-pane' }, h('div', { className: 'dsw-pane-t' }, '源码'), h('pre', { className: 'dsw-prose full' }, preview.markdown)),
                      h('div', { className: 'dsw-pane' }, h('div', { className: 'dsw-pane-t' }, '渲染'), h(Markdown, { text: preview.markdown })))))) : null)
    }

    var inject = ['slots']
    function apply(ctx) {
      installCss()
      ctx.effect(function () {
        return ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: PANEL_ID }, WriterPage)
        })
      })
      ctx.effect(function () {
        return ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 25,
            label: function () { return '写作' },
          }, WriterIcon)
        })
      })
    }

    return { apply: apply, inject: inject }
  },
})
