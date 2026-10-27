/**
 * Host half of dsh-plugin-writer.
 * Lists models already registered on this DSH host and runs a council:
 * several models draft the same topic, then a judge critiques and synthesizes.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { handleWriterRequest } from './http.js'
import { optimizeTopicPrompt, parseOptimizedTopic } from './prompts.js'
import { errorMessage } from './runs.js'
import { createOrchestrator, parseRunInput } from './runs.js'

export const name = 'dsh-writer'
export const inject = ['webServer', 'llm']

const DATA_FILE = join(homedir(), '.dsh', 'dsh-writer', 'state.json')
const OUTPUT_DIR = join(homedir(), '.dsh', 'dsh-writer', 'outputs')
const CATALOG_TTL_MS = 30_000
const CALL_TIMEOUT_MS = 8 * 60 * 1000

/**
 * @param {any} llm
 * @returns {() => Promise<{ providers: { id: string, name: string }[], models: { provider: string, id: string, name: string, hint?: string }[], errors: { provider: string, message: string }[] }>}
 */
function createCatalog(llm) {
  let cached = /** @type {{ at: number, value: any } | null} */ (null)
  return async function listModels() {
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.value
    const providers = llm.listProviders().map(provider => ({
      id: provider.id,
      name: provider.name || provider.id,
    }))
    const models = []
    const errors = []
    for (const provider of providers) {
      try {
        const listed = await llm.listModels(provider.id)
        for (const model of listed) {
          const id = model.id
          const hint = /image|imagine/i.test(id) ? '这个名字像图像模型，文本合稿可能会失败' : undefined
          models.push({
            provider: provider.id,
            id,
            name: model.name || id,
            ...(hint ? { hint } : {}),
          })
        }
      } catch (error) {
        errors.push({ provider: provider.id, message: errorMessage(error) })
      }
    }
    const value = { providers, models, errors }
    cached = { at: Date.now(), value }
    return value
  }
}

/**
 * @param {any} llm
 * @param {{ provider: string, model: string, system: string, user: string, temperature: number, signal: AbortSignal, onDelta?: (partial: { text: string, reasoning: string }) => void }} call
 */
async function completeWithLlm(llm, call) {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), CALL_TIMEOUT_MS)
  const onAbort = () => timeout.abort()
  call.signal.addEventListener('abort', onAbort, { once: true })
  let text = ''
  let reasoning = ''
  try {
    const stream = llm.stream({
      provider: call.provider,
      model: call.model,
      system: call.system,
      temperature: call.temperature,
      signal: timeout.signal,
      messages: [{ role: 'user', content: [{ type: 'text', text: call.user }] }],
    })
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'reasoning-delta') reasoning += chunk.text
      else if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          const message = chunk.reason.failure?.message || kind
          if (!text.trim()) throw new Error(message)
          call.onDelta?.({ text, reasoning })
          return { text, reasoning, error: message }
        }
      }
      if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
        call.onDelta?.({ text, reasoning })
      }
    }
    return { text, reasoning }
  } finally {
    clearTimeout(timer)
    call.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Pick a fast/capable model for topic optimization.
 * @param {any} body
 * @param {{ provider: string, id: string, name: string, hint?: string }[]} catalogModels
 */
function pickOptimizerModel(body, catalogModels) {
  const textModels = catalogModels.filter(m => !m.hint)
  const pool = textModels.length > 0 ? textModels : catalogModels
  if (pool.length === 0) throw new Error('当前宿主没有可用模型')

  if (body.model && typeof body.model === 'object') {
    const found = catalogModels.find(m => m.provider === body.model.provider && m.id === body.model.model)
    if (found) return found
  }
  if (typeof body.modelKey === 'string' && body.modelKey.includes('/')) {
    const found = catalogModels.find(m => (m.provider + '/' + m.id) === body.modelKey)
    if (found) return found
  }
  const preferred = [
    'local-proxy/gemini-3.8-flash',
    'local-proxy/deepseek-flash',
    'local-proxy/qwen3.8-max',
    'local-proxy/deepseek-v4-pro',
    'deepseek-official/deepseek-flash',
  ]
  for (const key of preferred) {
    const found = pool.find(m => (m.provider + '/' + m.id) === key)
    if (found) return found
  }
  return pool[0]
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const llm = ctx.llm
  const listModels = createCatalog(llm)
  const runs = createOrchestrator({
    dataFile: DATA_FILE,
    complete: call => completeWithLlm(llm, call),
  })

  async function optimizeTopic(body, catalogModels) {
    const target = pickOptimizerModel(body, catalogModels)
    const rawTopic = String(body.topic || '').trim()
    const rawFocus = typeof body.focus === 'string' ? body.focus.trim() : ''
    const mode = typeof body.mode === 'string' ? body.mode : 'expand'
    const prompt = optimizeTopicPrompt(rawTopic, rawFocus, mode)
    const controller = new AbortController()
    const out = await completeWithLlm(llm, {
      provider: target.provider,
      model: target.id,
      system: prompt.system,
      user: prompt.user,
      temperature: 0.5,
      signal: controller.signal,
    })
    if (!out.text.trim()) {
      throw new Error(out.error || '优化模型没有返回结果')
    }
    const parsed = parseOptimizedTopic(out.text, rawFocus)
    return {
      ...parsed,
      model: target.provider + '/' + target.id,
      modelName: target.name || target.id,
    }
  }

  console.log('[dsh-plugin-writer] mounted /api/writer')
  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: '/api/writer',
    handler: (req, res) => handleWriterRequest(req, res, { listModels, runs, parseRunInput, optimizeTopic, outputDir: OUTPUT_DIR }),
  })
  return () => {
    disposeRoute()
    runs.dispose()
  }
}
