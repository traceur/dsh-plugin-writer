/**
 * Prompt builders for the writer council.
 * Pure functions: the host fills them, tests assert their structure.
 */

/** @typedef {'distill' | 'consensus' | 'debate'} Strategy */

export const STRATEGIES = ['distill', 'consensus', 'debate']

const STRATEGY_GUIDE = {
  distill: '取精去糟、综合互补：保留各方独到且站得住的部分，丢掉空话、重复和不可靠的说法，重组成一篇比任何单稿都完整的终稿。',
  consensus: '共识提炼：优先保留多个模型共同支持、且没有被有力反驳的内容；分歧处明确标出，不要把未经核实的少数意见写成事实。',
  debate: '辩论批评：先指出各稿的具体优点和硬伤，再只采用经得起批评的部分。终稿要能看出取舍，而不是把原文拼接在一起。',
}

/**
 * @param {unknown} value
 * @returns {value is Strategy}
 */
export function isStrategy(value) {
  return value === 'distill' || value === 'consensus' || value === 'debate'
}

/**
 * Build prompt for AI topic/prompt optimization.
 * @param {string} rawTopic
 * @param {string} [rawFocus]
 * @param {string} [mode] - 'expand' | 'rigorous' | 'creative' | 'structured'
 * @returns {{ system: string, user: string }}
 */
export function optimizeTopicPrompt(rawTopic, rawFocus, mode = 'expand') {
  const modeGuides = {
    expand: '深度扩写与具象化：补齐背景假设、关键维度、受众定位与交付物结构，让多个大模型能产出有深度、可对比的内容。',
    rigorous: '严谨技术/分析向：强调逻辑推导、事实依据、边界条件、优缺点权衡与可执行落地方案。',
    creative: '创意与深度洞察向：鼓励打破常规视角，挖掘反直觉论点、生动案例与极具感染力的表达。',
    structured: '结构化报告向：明确要求章节大纲、核心指标、对比维度与总结建议。',
  }
  const guide = modeGuides[mode] || modeGuides.expand
  return {
    system: [
      '你是一位顶级的 Prompt 架构师与议题策划专家。',
      '用户的目标是让多个大模型针对同一个主题并行撰稿，再由裁判模型取精去糟合成终稿。',
      '请将用户输入的初步题目（和可选侧重）优化为一份高质量、指向明确、维度丰富的创作命题。',
      '优化方向：' + guide,
      '',
      '请严格按以下 JSON 格式输出（不要包裹多余解释，直接输出合法 JSON 对象）：',
      '{',
      '  "optimizedTopic": "优化后的完整题目与具体创作要求（分段清晰，包含核心问题、探讨维度与输出期望）",',
      '  "suggestedFocus": "提炼出的一句话核心评审侧重点（供裁判和撰稿模型参考）",',
      '  "improvements": ["优化亮点1", "优化亮点2", "优化亮点3"]',
      '}',
    ].join('\n'),
    user: [
      '原始题目：\n' + rawTopic.trim(),
      rawFocus && rawFocus.trim() ? '当前侧重：\n' + rawFocus.trim() : '当前侧重：（未填写）',
    ].join('\n\n'),
  }
}

/**
 * Parse AI optimization output safely (handles JSON blocks or raw text fallback).
 * @param {string} rawText
 * @param {string} fallbackFocus
 * @returns {{ optimizedTopic: string, suggestedFocus: string, improvements: string[] }}
 */
export function parseOptimizedTopic(rawText, fallbackFocus = '') {
  const text = (rawText || '').trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const optimizedTopic = typeof parsed.optimizedTopic === 'string' && parsed.optimizedTopic.trim()
        ? parsed.optimizedTopic.trim()
        : text
      const suggestedFocus = typeof parsed.suggestedFocus === 'string' && parsed.suggestedFocus.trim()
        ? parsed.suggestedFocus.trim()
        : fallbackFocus
      const improvements = Array.isArray(parsed.improvements)
        ? parsed.improvements.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
        : []
      return { optimizedTopic, suggestedFocus, improvements }
    } catch {
      // fall through to plain text
    }
  }
  return {
    optimizedTopic: text,
    suggestedFocus: fallbackFocus,
    improvements: ['已对原始题目进行结构化扩充与清晰度润色'],
  }
}

/**
 * @param {string} topic
 * @param {string} [focus]
 * @returns {{ system: string, user: string }}
 */
export function writerPrompt(topic, focus) {
  const extra = focus && focus.trim()
    ? '额外侧重：' + focus.trim()
    : '没有额外侧重，按主题本身把最有价值的内容写完整。'
  return {
    system: [
      '你是一位独立撰稿人，正在和另外几位作者分别完成同一题目。你看不到他们的稿子。',
      '直接交付可以阅读的成品，不要写“作为一个模型”、不要解释你的写作步骤、不要用套话开场。',
      '要求：结构清楚；论点具体；能举例子或给出可执行细节时就给出；不确定的事实要标明不确定，不要编造来源、数据或引文。',
      '篇幅服务于题目：题目要短答就短答，题目要成稿就写成完整成稿。避免注水重复。',
    ].join('\n'),
    user: '题目：\n' + topic.trim() + '\n\n' + extra,
  }
}

/**
 * @param {{ name: string, text: string }[]} candidates
 * @param {number} [limit]
 * @returns {{ name: string, text: string, truncated: boolean }[]}
 */
export function clipCandidates(candidates, limit = 12000) {
  return candidates.map(candidate => {
    const text = candidate.text.trim()
    if (text.length <= limit) return { name: candidate.name, text, truncated: false }
    return {
      name: candidate.name,
      text: text.slice(0, limit) + '\n\n[以下原文已截断，只把前 ' + String(limit) + ' 字交给裁判]',
      truncated: true,
    }
  })
}

function candidateBodies(candidates, limit) {
  return clipCandidates(candidates, limit).map((candidate, index) => {
    return '### 候选 ' + String(index + 1) + '：' + candidate.name + '\n' + (candidate.text || '（空稿）')
  })
}

/**
 * @param {Strategy} strategy
 * @param {string} topic
 * @param {string | undefined} focus
 * @param {{ name: string, text: string }[]} candidates
 * @returns {{ system: string, user: string }}
 */
export function critiquePrompt(strategy, topic, focus, candidates) {
  return {
    system: [
      '你是这组稿件的裁判编辑。这一步只做交叉评审和取舍，不要重写终稿。',
      '评审策略：' + STRATEGY_GUIDE[strategy],
      '必须按下面的 Markdown 标题输出，方便阅读中间过程：',
      '## 交叉评审',
      '对每一份候选单独一节，标题用候选名称。每节都要有：精华、糟粕、独到之处。糟粕要具体到事实错误、逻辑漏洞、空话或冗余，不要只写“一般”。',
      '## 取舍清单',
      '分“采纳”和“舍弃”两小节。采纳写明来自哪一稿；舍弃写明原因。',
      '## 冲突与事实核查',
      '列出稿件之间的冲突，以及你无法核实、因此不能写成定论的地方。',
    ].join('\n'),
    user: [
      '题目：\n' + topic.trim(),
      focus && focus.trim() ? '侧重：' + focus.trim() : '侧重：无',
      '',
      candidateBodies(candidates, 12000).join('\n\n'),
    ].join('\n'),
  }
}

/**
 * @param {Strategy} strategy
 * @param {string} topic
 * @param {string | undefined} focus
 * @param {{ name: string, text: string }[]} candidates
 * @param {string} critique
 * @returns {{ system: string, user: string }}
 */
export function synthesisPrompt(strategy, topic, focus, candidates, critique) {
  const originals = clipCandidates(candidates, 8000).map(candidate => {
    return '### ' + candidate.name + '\n' + (candidate.text || '（空稿）')
  })
  return {
    system: [
      '你是终稿编辑。根据题目、各候选原文和裁判的取舍清单，重写一篇可以直接交付的终稿。',
      '策略：' + STRATEGY_GUIDE[strategy],
      '规则：',
      '- 丢掉裁判标成糟粕的内容，不要把它们换个说法留在正文里。',
      '- 把采纳的精华重组，不要按模型逐段拼接，也不要写“模型 A 认为”。',
      '- 冲突未核实的内容不要写成事实；需要保留时放进文末裁决摘要。',
      '- 终稿本身要完整、可读。文末另起一节“## 裁决摘要”，用简短条目说明保留了什么、删掉了什么。',
    ].join('\n'),
    user: [
      '题目：\n' + topic.trim(),
      focus && focus.trim() ? '侧重：' + focus.trim() : '侧重：无',
      '',
      '## 裁判取舍',
      critique.trim() || '（裁判没有留下评审）',
      '',
      '## 候选原文',
      originals.join('\n\n'),
    ].join('\n'),
  }
}

/**
 * Generate a visual concept prompt for image models to create an overview illustration.
 * @param {string} topic
 * @param {string} [focus]
 * @returns {string}
 */
export function imageOverviewPrompt(topic, focus) {
  return [
    'Create a stunning, high-quality, professional editorial concept illustration that visualizes the core theme: ' + topic.trim(),
    focus ? ('Context and visual tone: ' + focus.trim()) : '',
    'Style: Modern minimalist tech editorial art, clean composition, sophisticated color palette, 8k resolution concept visual, no messy text.',
  ].filter(Boolean).join('. ');
}
