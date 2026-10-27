/**
 * Same-origin JSON and Markdown file routes for the writer panel.
 * The browser talks to the host; model credentials stay in ctx.llm.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
}
const MAX_BODY = 65536

export function isLoopbackAddress(address) {
  if (!address) return false
  const host = address.replace(/^::ffff:/, '')
  return host === '127.0.0.1' || host === '::1' || host.startsWith('127.')
}

export function isRequestAllowed(req) {
  const site = req.headers['sec-fetch-site']
  if (site === 'same-origin' || site === 'none') return true
  if (site === 'cross-site' || site === 'same-site') return false
  return isLoopbackAddress(req.socket?.remoteAddress)
}

export function writeJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * Build markdown document for a run.
 * @param {any} run
 * @param {'final' | 'critique' | 'full'} [scope]
 * @returns {string}
 */
export function buildRunMarkdown(run, scope = 'final') {
  if (scope === 'final') {
    return [
      '# ' + run.topic,
      '',
      run.imageOverview?.imageUrl ? ('![' + run.topic + '](' + run.imageOverview.imageUrl + ')\n\n*视觉总览配图 (由 ' + (run.imageModel?.name || '生图模型') + ' 生成)*\n') : '',
      run.focus ? '> **评审侧重**：' + run.focus + '\n' : '',
      '> **主审裁判**：' + (run.judge?.name || run.judge?.model || '') + ' · **策略**：' + (run.strategy || 'distill'),
      '',
      '---',
      '',
      run.synthesis?.text || '（终稿尚未生成）',
      '',
    ].filter(Boolean).join('\n')
  }
  if (scope === 'critique') {
    return [
      '# 交叉评审报告：' + run.topic,
      '',
      '> **主审裁判**：' + (run.judge?.name || run.judge?.model || ''),
      '',
      '---',
      '',
      run.critique?.text || '（评审尚未生成）',
      '',
    ].join('\n')
  }
  const parts = [
    '# ' + run.topic,
    '',
    run.focus ? '> **评审侧重**：' + run.focus : '',
    '> **主审裁判**：' + (run.judge?.name || run.judge?.model || '') + ' · **策略**：' + (run.strategy || 'distill'),
    '',
    '---',
    '',
    '## 一、 裁判综合终稿',
    '',
    run.synthesis?.text || '（暂无终稿）',
    '',
    '---',
    '',
    '## 二、 裁判交叉评审与取舍清单',
    '',
    run.critique?.text || '（暂无评审）',
    '',
    '---',
    '',
    '## 三、 各候选模型独立初稿',
    '',
  ]
  for (let i = 0; i < (run.candidates || []).length; i++) {
    const c = run.candidates[i]
    parts.push('### ' + (i + 1) + '. ' + c.name + ' (' + c.key + ')')
    parts.push('')
    parts.push(c.text || '（无正文）')
    parts.push('')
  }
  return parts.join('\n')
}

export async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY) {
      req.destroy()
      return null
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function requestPath(url) {
  const raw = url || '/'
  const query = raw.indexOf('?')
  return query === -1 ? raw : raw.slice(0, query)
}

export async function handleWriterRequest(req, res, deps) {
  if (!isRequestAllowed(req)) {
    writeJson(res, 403, { error: '只接受本机或同一页面的请求' })
    return
  }
  const path = requestPath(req.url)
  const method = req.method || 'GET'
  if (method === 'GET' && path === '/api/writer/health') {
    writeJson(res, 200, { ok: true, name: 'dsh-plugin-writer' })
    return
  }
  if (method === 'GET' && path === '/api/writer/models') {
    try {
      writeJson(res, 200, await deps.listModels())
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  if (method === 'POST' && path === '/api/writer/optimize') {
    if (!deps.optimizeTopic) {
      writeJson(res, 501, { error: '宿主未启用优化服务' })
      return
    }
    const body = await readJsonBody(req)
    if (!body || typeof body !== 'object') {
      writeJson(res, 400, { error: '请求体不是有效 JSON' })
      return
    }
    const rawTopic = typeof body.topic === 'string' ? body.topic.trim() : ''
    if (!rawTopic) {
      writeJson(res, 400, { error: '请先输入初步题目或想法，再点击 AI 优化' })
      return
    }
    if (rawTopic.length > 8000) {
      writeJson(res, 400, { error: '题目内容过长' })
      return
    }
    try {
      const catalog = await deps.listModels()
      const result = await deps.optimizeTopic(body, catalog.models)
      writeJson(res, 200, result)
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  if (method === 'GET' && path === '/api/writer/runs') {
    writeJson(res, 200, { runs: deps.runs.list() })
    return
  }
  if (method === 'POST' && path === '/api/writer/runs') {
    const body = await readJsonBody(req)
    if (body === null) {
      writeJson(res, 400, { error: '请求体不是有效 JSON，或超过 64 KiB' })
      return
    }
    let catalog
    try {
      catalog = await deps.listModels()
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      return
    }
    const parsed = deps.parseRunInput(body, catalog.models)
    if (!parsed.ok) {
      writeJson(res, 400, { error: parsed.error })
      return
    }
    writeJson(res, 202, { run: deps.runs.start(parsed.value) })
    return
  }
  const mdMatch = path.match(/^\/api\/writer\/runs\/([^/]+)\/markdown$/)
  if (mdMatch && method === 'GET') {
    const id = decodeURIComponent(mdMatch[1])
    const run = deps.runs.get(id)
    if (!run) {
      writeJson(res, 404, { error: '找不到这个任务' })
      return
    }
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1')
    const rawScope = urlObj.searchParams.get('scope') || 'final'
    const scope = (rawScope === 'critique' || rawScope === 'full') ? rawScope : 'final'
    const format = urlObj.searchParams.get('format') || 'json'
    const markdown = buildRunMarkdown(run, scope)
    const fileName = id + '-' + scope + '.md'
    let savedPath = ''
    if (deps.outputDir) {
      try {
        mkdirSync(deps.outputDir, { recursive: true })
        savedPath = join(deps.outputDir, fileName)
        writeFileSync(savedPath, markdown, 'utf8')
      } catch {
        // non-fatal
      }
    }
    if (format === 'raw') {
      res.writeHead(200, {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline; filename="' + fileName + '"',
        'cache-control': 'no-store',
      })
      res.end(markdown)
      return
    }
    writeJson(res, 200, {
      id: run.id,
      scope,
      fileName,
      filePath: savedPath,
      rawUrl: '/api/writer/runs/' + encodeURIComponent(run.id) + '/markdown?scope=' + scope + '&format=raw',
      markdown,
    })
    return
  }
  const cancel = path.match(/^\/api\/writer\/runs\/([^/]+)\/cancel$/)
  if (cancel && method === 'POST') {
    const run = deps.runs.cancel(decodeURIComponent(cancel[1]))
    if (!run) {
      writeJson(res, 404, { error: '找不到这个任务' })
      return
    }
    writeJson(res, 200, { run })
    return
  }
  const one = path.match(/^\/api\/writer\/runs\/([^/]+)$/)
  if (one && method === 'GET') {
    const run = deps.runs.get(decodeURIComponent(one[1]))
    if (!run) {
      writeJson(res, 404, { error: '找不到这个任务' })
      return
    }
    writeJson(res, 200, { run })
    return
  }
  writeJson(res, 404, { error: '未知路径' })
}
