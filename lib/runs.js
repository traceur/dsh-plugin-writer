/**
 * In-memory council runs. The host injects the model call; tests inject a fake.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { critiquePrompt, isStrategy, synthesisPrompt, writerPrompt, imageOverviewPrompt } from './prompts.js'

export const MAX_CANDIDATES = 5
export const MIN_CANDIDATES = 2
const MAX_TOPIC = 8000
const MAX_FOCUS = 2000
const MAX_RUNS = 20
const PERSIST_WAIT_MS = 1200

/**
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function createId(prefix = 'wr') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

/**
 * @param {unknown} value
 * @returns {{ provider: string, model: string } | null}
 */
function modelRef(value) {
  if (!value || typeof value !== 'object') return null
  const row = /** @type {{ provider?: unknown, model?: unknown }} */ (value)
  if (typeof row.provider !== 'string' || typeof row.model !== 'string') return null
  const provider = row.provider.trim()
  const model = row.model.trim()
  if (!provider || !model || provider.length > 80 || model.length > 160) return null
  return { provider, model }
}

/**
 * @param {unknown} input
 * @param {{ provider: string, id: string, name: string }[]} catalog
 * @returns {{ ok: true, value: { topic: string, focus: string, strategy: 'distill' | 'consensus' | 'debate', models: { provider: string, model: string, name: string }[], judge: { provider: string, model: string, name: string } } } | { ok: false, error: string }}
 */
export function parseRunInput(input, catalog) {
  if (!input || typeof input !== 'object') return { ok: false, error: '请求体必须是 JSON 对象' }
  const body = /** @type {Record<string, unknown>} */ (input)
  if (typeof body.topic !== 'string' || !body.topic.trim()) return { ok: false, error: '请填写题目' }
  if (body.topic.trim().length > MAX_TOPIC) return { ok: false, error: '题目过长' }
  const focus = typeof body.focus === 'string' ? body.focus.trim() : ''
  if (focus.length > MAX_FOCUS) return { ok: false, error: '侧重说明过长' }
  const strategy = body.strategy === undefined ? 'distill' : body.strategy
  if (!isStrategy(strategy)) return { ok: false, error: '未知的合稿策略' }
  if (!Array.isArray(body.models)) return { ok: false, error: '请选择候选模型' }
  if (body.models.length < MIN_CANDIDATES || body.models.length > MAX_CANDIDATES) {
    return { ok: false, error: '候选模型需要 ' + String(MIN_CANDIDATES) + ' 到 ' + String(MAX_CANDIDATES) + ' 个' }
  }
  const known = new Map(catalog.map(row => [row.provider + '/' + row.id, row]))
  const models = []
  const seen = new Set()
  for (const item of body.models) {
    const ref = modelRef(item)
    if (!ref) return { ok: false, error: '候选模型格式不正确' }
    const key = ref.provider + '/' + ref.model
    if (seen.has(key)) return { ok: false, error: '候选模型不能重复：' + key }
    const match = known.get(key)
    if (!match) return { ok: false, error: '候选模型不在当前宿主目录中：' + key }
    seen.add(key)
    models.push({ provider: ref.provider, model: ref.model, name: match.name || ref.model })
  }
  const judgeRef = modelRef(body.judge)
  if (!judgeRef) return { ok: false, error: '请指定裁判模型' }
  const judgeMatch = known.get(judgeRef.provider + '/' + judgeRef.model)
  if (!judgeMatch) return { ok: false, error: '裁判模型不在当前宿主目录中' }
  let imageModel = null
  if (body.imageModel) {
    const imgRef = modelRef(body.imageModel)
    if (imgRef) {
      const imgMatch = known.get(imgRef.provider + '/' + imgRef.model)
      if (imgMatch) {
        imageModel = { provider: imgRef.provider, model: imgRef.model, name: imgMatch.name || imgRef.model }
      }
    }
  }
  return {
    ok: true,
    value: {
      topic: body.topic.trim(),
      focus,
      strategy,
      models,
      judge: { provider: judgeRef.provider, model: judgeRef.model, name: judgeMatch.name || judgeRef.model },
      imageModel,
    },
  }
}

function emptyStage() {
  return { status: 'pending', text: '', reasoning: '', error: '' }
}

/**
 * @param {ReturnType<typeof parseRunInput> extends { ok: true, value: infer V } ? V : never} value
 * @param {number} now
 */
export function createRunRecord(value, now) {
  return {
    id: createId(),
    topic: value.topic,
    focus: value.focus,
    strategy: value.strategy,
    status: 'running',
    error: '',
    createdAt: now,
    updatedAt: now,
    judge: value.judge,
    imageModel: value.imageModel || null,
    imageOverview: value.imageModel ? { status: 'pending', text: '', imageUrl: '', error: '' } : null,
    candidates: value.models.map(model => ({
      key: model.provider + '/' + model.model,
      provider: model.provider,
      model: model.model,
      name: model.name,
      status: 'pending',
      text: '',
      reasoning: '',
      error: '',
      startedAt: 0,
      finishedAt: 0,
    })),
    critique: emptyStage(),
    synthesis: emptyStage(),
    events: [{ at: now, message: '任务已创建' }],
  }
}

/**
 * @param {any} run
 */
export function publicRun(run) {
  return {
    id: run.id,
    topic: run.topic,
    focus: run.focus,
    strategy: run.strategy,
    status: run.status,
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    judge: run.judge,
    imageModel: run.imageModel || null,
    imageOverview: run.imageOverview || null,
    candidates: run.candidates,
    critique: run.critique,
    synthesis: run.synthesis,
    events: run.events,
  }
}

/**
 * @param {{
 *   complete: (call: { provider: string, model: string, system: string, user: string, temperature: number, signal: AbortSignal, onDelta?: (partial: { text: string, reasoning: string }) => void }) => Promise<{ text: string, reasoning?: string, error?: string }>,
 *   now?: () => number,
 *   dataFile?: string,
 * }} options
 */
export function createOrchestrator(options) {
  const now = options.now ?? (() => Date.now())
  /** @type {Map<string, any>} */
  const runs = new Map()
  /** @type {Map<string, AbortController>} */
  const controllers = new Map()
  let persistTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

  const pushEvent = (run, message) => {
    run.events.push({ at: now(), message })
    if (run.events.length > 80) run.events.splice(0, run.events.length - 80)
    run.updatedAt = now()
  }

  const snapshot = () => [...runs.values()].map(publicRun)

  const writeState = () => {
    if (!options.dataFile) return
    try {
      mkdirSync(join(options.dataFile, '..'), { recursive: true })
      writeFileSync(options.dataFile, JSON.stringify({ runs: snapshot() }, null, 2))
    } catch (error) {
      console.error('dsh-writer: persist failed: ' + errorMessage(error))
    }
  }

  const schedulePersist = () => {
    if (!options.dataFile || persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      writeState()
    }, PERSIST_WAIT_MS)
  }

  const touch = (run) => {
    run.updatedAt = now()
    schedulePersist()
  }

  if (options.dataFile) {
    try {
      const saved = JSON.parse(readFileSync(options.dataFile, 'utf8'))
      const rows = Array.isArray(saved?.runs) ? saved.runs : []
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue
        if (row.status === 'running' || row.status === 'judging') {
          row.status = 'failed'
          row.error = row.error || '宿主重启，任务已中断'
        }
        runs.set(row.id, row)
      }
    } catch {
      // first launch, or an unreadable file: start empty
    }
  }

  /**
   * @param {any} run
   * @param {any} candidate
   * @param {AbortSignal} signal
   */
  async function generateOne(run, candidate, signal) {
    if (signal.aborted || run.status === 'cancelled') return
    candidate.status = 'running'
    candidate.startedAt = now()
    pushEvent(run, candidate.name + ' 开始生成')
    touch(run)
    const prompt = writerPrompt(run.topic, run.focus)
    try {
      const result = await options.complete({
        provider: candidate.provider,
        model: candidate.model,
        system: prompt.system,
        user: prompt.user,
        temperature: 0.7,
        signal,
        onDelta(partial) {
          if (run.status === 'cancelled') return
          candidate.text = partial.text
          candidate.reasoning = partial.reasoning
          touch(run)
        },
      })
      if (signal.aborted || run.status === 'cancelled') {
        candidate.status = 'cancelled'
        return
      }
      candidate.text = result.text || ''
      candidate.reasoning = result.reasoning || ''
      candidate.finishedAt = now()
      if (!candidate.text.trim()) {
        candidate.status = 'failed'
        candidate.error = result.error || '模型没有返回正文'
        pushEvent(run, candidate.name + ' 未产出正文')
      } else {
        candidate.status = 'done'
        candidate.error = result.error || ''
        pushEvent(run, candidate.name + ' 已完成')
      }
      touch(run)
    } catch (error) {
      if (signal.aborted || run.status === 'cancelled') {
        candidate.status = 'cancelled'
        return
      }
      candidate.status = 'failed'
      candidate.error = errorMessage(error)
      candidate.finishedAt = now()
      pushEvent(run, candidate.name + ' 失败：' + candidate.error)
      touch(run)
    }
  }

  /**
   * @param {any} run
   * @param {AbortSignal} signal
   */
  async function generateImageOverview(run, signal) {
    if (!run.imageModel || !run.imageOverview || signal.aborted || run.status === 'cancelled') return
    run.imageOverview.status = 'running'
    pushEvent(run, '生图模型 ' + run.imageModel.name + ' 开始构思总览配图')
    touch(run)
    const prompt = imageOverviewPrompt(run.topic, run.focus)
    try {
      const result = await options.complete({
        provider: run.imageModel.provider,
        model: run.imageModel.model,
        system: 'You are an elite visual director and concept artist. Output an editorial illustration overview banner.',
        user: prompt,
        temperature: 0.6,
        signal,
      })
      if (signal.aborted || run.status === 'cancelled') {
        run.imageOverview.status = 'cancelled'
        return
      }
      run.imageOverview.text = result.text || ''
      // 提取 markdown 图片或 base64 或 http 链接
      const imgMatch = (result.text || '').match(/!\[[^\]]*\]\(([^\)]+)\)/) || (result.text || '').match(/https?:\/\/[^\s"'>]+\.(?:png|jpg|jpeg|webp)/i)
      if (imgMatch) {
        run.imageOverview.imageUrl = imgMatch[1] || imgMatch[0]
      }
      run.imageOverview.status = 'done'
      pushEvent(run, '总览配图生成完成')
      touch(run)
    } catch (err) {
      if (signal.aborted || run.status === 'cancelled') return
      run.imageOverview.status = 'failed'
      run.imageOverview.error = errorMessage(err)
      pushEvent(run, '总览配图失败: ' + run.imageOverview.error)
      touch(run)
    }
  }

  async function judge(run, signal) {
    const ready = run.candidates.filter(candidate => candidate.status === 'done' && candidate.text.trim())
    if (ready.length === 0) {
      run.status = 'failed'
      run.error = '所有候选模型都没有产出可用内容'
      pushEvent(run, run.error)
      touch(run)
      writeState()
      return
    }
    run.status = 'judging'
    run.critique.status = 'running'
    pushEvent(run, '裁判开始交叉评审')
    touch(run)
    const packed = ready.map(candidate => ({ name: candidate.name, text: candidate.text }))
    try {
      const critique = critiquePrompt(run.strategy, run.topic, run.focus, packed)
      const reviewed = await options.complete({
        provider: run.judge.provider,
        model: run.judge.model,
        system: critique.system,
        user: critique.user,
        temperature: 0.2,
        signal,
        onDelta(partial) {
          if (run.status === 'cancelled') return
          run.critique.text = partial.text
          run.critique.reasoning = partial.reasoning
          touch(run)
        },
      })
      if (signal.aborted || run.status === 'cancelled') return
      run.critique.text = reviewed.text || ''
      run.critique.reasoning = reviewed.reasoning || ''
      if (!run.critique.text.trim()) throw new Error(reviewed.error || '裁判没有返回评审')
      run.critique.status = 'done'
      pushEvent(run, '交叉评审完成，开始提炼终稿')
      run.synthesis.status = 'running'
      touch(run)
      const synthesis = synthesisPrompt(run.strategy, run.topic, run.focus, packed, run.critique.text)
      const drafted = await options.complete({
        provider: run.judge.provider,
        model: run.judge.model,
        system: synthesis.system,
        user: synthesis.user,
        temperature: 0.3,
        signal,
        onDelta(partial) {
          if (run.status === 'cancelled') return
          run.synthesis.text = partial.text
          run.synthesis.reasoning = partial.reasoning
          touch(run)
        },
      })
      if (signal.aborted || run.status === 'cancelled') return
      run.synthesis.text = drafted.text || ''
      run.synthesis.reasoning = drafted.reasoning || ''
      if (!run.synthesis.text.trim()) throw new Error(drafted.error || '裁判没有返回终稿')
      run.synthesis.status = 'done'
      run.status = 'done'
      pushEvent(run, '合稿完成')
      touch(run)
      writeState()
    } catch (error) {
      if (signal.aborted || run.status === 'cancelled') return
      const message = errorMessage(error)
      if (run.synthesis.status === 'running') {
        run.synthesis.status = 'failed'
        run.synthesis.error = message
        run.error = '终稿生成失败：' + message
      } else {
        run.critique.status = 'failed'
        run.critique.error = message
        run.error = '裁判评审失败：' + message
      }
      run.status = 'failed'
      pushEvent(run, run.error)
      touch(run)
      writeState()
    }
  }

  return {
    list() {
      return [...runs.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_RUNS)
        .map(run => ({
          id: run.id,
          topic: run.topic,
          status: run.status,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          strategy: run.strategy,
        }))
    },
    get(id) {
      const run = runs.get(id)
      return run ? publicRun(run) : null
    },
    /**
     * @param {ReturnType<typeof parseRunInput> extends { ok: true, value: infer V } ? V : never} value
     */
    start(value) {
      const run = createRunRecord(value, now())
      runs.set(run.id, run)
      while (runs.size > MAX_RUNS) {
        const oldest = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
        if (!oldest || oldest.id === run.id) break
        runs.delete(oldest.id)
        controllers.get(oldest.id)?.abort()
        controllers.delete(oldest.id)
      }
      const controller = new AbortController()
      controllers.set(run.id, controller)
      void (async () => {
        const tasks = run.candidates.map(candidate => generateOne(run, candidate, controller.signal))
        if (run.imageModel) {
          tasks.push(generateImageOverview(run, controller.signal))
        }
        await Promise.all(tasks)
        if (controller.signal.aborted || run.status === 'cancelled') {
          writeState()
          return
        }
        await judge(run, controller.signal)
      })()
      schedulePersist()
      return publicRun(run)
    },
    cancel(id) {
      const run = runs.get(id)
      if (!run) return null
      if (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled') return publicRun(run)
      controllers.get(id)?.abort()
      run.status = 'cancelled'
      run.error = ''
      for (const candidate of run.candidates) {
        if (candidate.status === 'pending' || candidate.status === 'running') candidate.status = 'cancelled'
      }
      if (run.critique.status === 'pending' || run.critique.status === 'running') run.critique.status = 'cancelled'
      if (run.synthesis.status === 'pending' || run.synthesis.status === 'running') run.synthesis.status = 'cancelled'
      pushEvent(run, '已取消')
      writeState()
      return publicRun(run)
    },
    dispose() {
      for (const controller of controllers.values()) controller.abort()
      if (persistTimer) clearTimeout(persistTimer)
      writeState()
    },
  }
}
