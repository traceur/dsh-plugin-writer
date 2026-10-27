import type { Context } from '@deepseek-ai/cordis'
import type { ModelOption } from '../types.js'

export class LlmDispatcher {
  constructor(private ctx: Context) {}

  /**
   * 获取当前宿主环境中所有配置好的模型列表
   */
  async listAvailableModels(): Promise<ModelOption[]> {
    const results: ModelOption[] = []
    try {
      const llmService = this.ctx.get('llm') as any
      if (!llmService) return results

      const providers = await llmService.listProviders()
      for (const p of providers) {
        try {
          const models = await llmService.listModels(p.id)
          for (const m of models) {
            results.push({
              provider: p.id,
              id: m.id,
              name: m.name || m.id,
              displayName: `${p.name || p.id} - ${m.name || m.id}`
            })
          }
        } catch (e) {
          // ignore error for single provider
        }
      }
    } catch (err) {
      console.error('[dsh-writer] listAvailableModels error:', err)
    }
    return results
  }

  /**
   * 调用单一模型完成单次文本生成任务
   */
  async generateText(
    provider: string,
    model: string,
    prompt: string,
    systemPrompt?: string,
    onDelta?: (delta: string) => void
  ): Promise<string> {
    const llmService = this.ctx.get('llm') as any
    if (!llmService) {
      throw new Error('DSH LLM service not available in context')
    }

    const messages: any[] = []
    if (systemPrompt) {
      messages.push({
        role: 'system',
        source: { kind: 'system-prompt' },
        content: [{ type: 'text', text: systemPrompt }]
      })
    }
    messages.push({
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: prompt }]
    })

    let fullText = ''
    try {
      const stream = await llmService.stream({
        provider,
        model,
        messages
      })

      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') {
          fullText += chunk.text
          if (onDelta) onDelta(chunk.text)
        }
      }
    } catch (err: any) {
      console.error(`[dsh-writer] generation error on ${provider}/${model}:`, err)
      throw err
    }

    return fullText
  }
}
