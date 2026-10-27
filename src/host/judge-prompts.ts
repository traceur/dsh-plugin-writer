import type { CandidateGeneration, JudgeResult, ModelCritique } from '../types.js'

export function buildJudgePrompt(
  topic: string,
  requirements: string | undefined,
  candidates: CandidateGeneration[]
): string {
  const candidateTexts = candidates.map((c, i) => {
    return `=== [模型 ${i + 1}]: ${c.provider} / ${c.modelId} ===\n${c.content}\n`
  }).join('\n----------------------------------------\n\n')

  return `你是一位具备极高专业水准、严谨批判性思维与卓越文字整合能力的【高级首席评审兼总编辑】。
现在，多个顶尖大语言模型针对同一个主题输出各自的方案/内容。
你的任务是：深入对比各模型的回答，去粗取精、去伪存真，剔除平庸、冗余、事实谬误或逻辑缺陷，吸纳每个模型的独特洞见与精妙构想，最终打磨输出一份远超单一大模型水平的高品质综合成果。

【主题/创作任务】：
${topic}
${requirements ? `\n【特殊要求与约束】：\n${requirements}\n` : ''}

【各候选模型的原始输出】：
${candidateTexts}

----------------------------------------
请按照以下严格的四阶段结构进行处理与输出，请严格使用对应的 Markdown 标题，以便系统结构化提炼：

# 阶段一：各模型审校与优劣分析
针对每个模型，进行客观犀利的评审：
针对每个模型输出如下格式：
### 模型：[模型名称]
- **亮点与精髓**：[列出该模型的独特视角、深刻论点或精妙结构]
- **不足与糟粕**：[指出空话套话、事实漏洞、逻辑不顺或可被舍弃的部分]

# 阶段二：取精去糟清单
- **已采纳的精华点**：
  * [点1（来源模型）]
  * [点2（来源模型）]
- **已剔除的糟粕与弃用说明**：
  * [丢弃内容1及剔除理由]
  * [丢弃内容2及剔除理由]

# 阶段三：裁判提炼终稿
（在此呈现融汇贯通、精雕细琢的最终高质量正文，逻辑清晰、论述充分、行文流畅，无需重复说明你在采纳谁，直接输出终极成果）

# 阶段四：裁判总结
用简练精炼的2-3句话总结本次多模型碰撞的核心增益与裁决结论。
`
}

export function parseJudgeOutput(rawOutput: string): Omit<JudgeResult, 'status' | 'durationMs' | 'error'> {
  const critiques: ModelCritique[] = []
  const extractedEssence: string[] = []
  const discardedPoints: string[] = []
  let finalSynthesis = ''

  // 截取阶段一、阶段二、阶段三
  const stage1Match = rawOutput.match(/# 阶段一[：:]?[\s\S]*?(?=# 阶段二|$)/i)
  const stage2Match = rawOutput.match(/# 阶段二[：:]?[\s\S]*?(?=# 阶段三|$)/i)
  const stage3Match = rawOutput.match(/# 阶段三[：:]?[\s\S]*?(?=# 阶段四|$)/i)

  if (stage1Match) {
    const stage1Text = stage1Match[0]
    const modelBlocks = stage1Text.split(/###\s*模型[：:]?\s*/).slice(1)
    for (const block of modelBlocks) {
      const lines = block.split('\n')
      const modelId = lines[0]?.trim() || 'Unknown Model'
      const blockContent = lines.slice(1).join('\n')

      const strengths: string[] = []
      const weaknesses: string[] = []

      const strMatch = blockContent.match(/\*\*亮点与精髓\*\*[：:]?([\s\S]*?)(?=\*\*不足与糟粕\*\*|$)/i)
      const weakMatch = blockContent.match(/\*\*不足与糟粕\*\*[：:]?([\s\S]*?)$/i)

      if (strMatch && strMatch[1]) {
        strengths.push(...strMatch[1].split('\n').map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean))
      }
      if (weakMatch && weakMatch[1]) {
        weaknesses.push(...weakMatch[1].split('\n').map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean))
      }

      critiques.push({
        modelId,
        strengths,
        weaknesses,
        uniqueInsights: []
      })
    }
  }

  if (stage2Match) {
    const stage2Text = stage2Match[0]
    const essenceMatch = stage2Text.match(/已采纳的精华点[：:]?([\s\S]*?)(?=已剔除的糟粕|$)/i)
    const discardedMatch = stage2Text.match(/已剔除的糟粕[与及说明]*[：:]?([\s\S]*?)$/i)

    if (essenceMatch && essenceMatch[1]) {
      extractedEssence.push(...essenceMatch[1].split('\n').map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean))
    }
    if (discardedMatch && discardedMatch[1]) {
      discardedPoints.push(...discardedMatch[1].split('\n').map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean))
    }
  }

  if (stage3Match) {
    finalSynthesis = stage3Match[0].replace(/^# 阶段三[：:]?[^\n]*\n/, '').trim()
  } else {
    // 降级兜底
    finalSynthesis = rawOutput
  }

  return {
    rawJudgeOutput: rawOutput,
    critiques,
    extractedEssence,
    discardedPoints,
    finalSynthesis: finalSynthesis || rawOutput
  }
}
