import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { handleWriterRequest, isRequestAllowed } from '../lib/http.js'
import { critiquePrompt, optimizeTopicPrompt, parseOptimizedTopic, synthesisPrompt, writerPrompt } from '../lib/prompts.js'
import { createOrchestrator, parseRunInput } from '../lib/runs.js'

const catalog = [
  { provider: 'local-proxy', id: 'alpha', name: 'Alpha' },
  { provider: 'local-proxy', id: 'beta', name: 'Beta' },
  { provider: 'local-proxy', id: 'judge', name: 'Judge' },
  { provider: 'local-proxy', id: 'bad', name: 'Bad' },
]

function input(overrides = {}) {
  return {
    topic: '写一段关于上下文工程的说明',
    focus: '面向工程团队',
    strategy: 'distill',
    models: [
      { provider: 'local-proxy', model: 'alpha' },
      { provider: 'local-proxy', model: 'beta' },
    ],
    judge: { provider: 'local-proxy', model: 'judge' },
    ...overrides,
  }
}

test('writer and judge prompts keep the topic, focus, and strategy duties', () => {
  const writer = writerPrompt('同一题目', '要可执行')
  assert.match(writer.user, /同一题目/)
  assert.match(writer.user, /要可执行/)
  assert.match(writer.system, /看不到他们的稿子/)
  const critique = critiquePrompt('debate', '同一题目', '', [
    { name: 'Alpha', text: '甲稿很长'.repeat(20) },
    { name: 'Beta', text: '乙稿' },
  ])
  assert.match(critique.system, /不要重写终稿/)
  assert.match(critique.system, /辩论批评/)
  assert.match(critique.user, /Alpha/)
  assert.match(critique.user, /乙稿/)
  const synthesis = synthesisPrompt('consensus', '同一题目', '侧重事实', [
    { name: 'Alpha', text: '甲' },
  ], '## 取舍清单\n采纳甲')
  assert.match(synthesis.system, /共识提炼/)
  assert.match(synthesis.system, /裁决摘要/)
  assert.match(synthesis.user, /采纳甲/)
})

test('parseRunInput rejects a council that is not actually multi-model', () => {
  const missing = parseRunInput({ topic: '  ' }, catalog)
  assert.equal(missing.ok, false)
  const one = parseRunInput(input({ models: [{ provider: 'local-proxy', model: 'alpha' }] }), catalog)
  assert.equal(one.ok, false)
  const unknown = parseRunInput(input({
    models: [
      { provider: 'local-proxy', model: 'alpha' },
      { provider: 'other', model: 'nope' },
    ],
  }), catalog)
  assert.equal(unknown.ok, false)
  assert.match(unknown.error, /不在当前宿主目录/)
  const ok = parseRunInput(input(), catalog)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.value.models[0].name, 'Alpha')
})

function fakeComplete(calls) {
  return async function complete(call) {
    calls.push({ model: call.model, system: call.system })
    call.onDelta?.({ text: 'streaming-' + call.model, reasoning: '' })
    if (call.model === 'bad') throw new Error('provider down')
    if (call.system.includes('裁判编辑')) return { text: '## 交叉评审\nAlpha 的例子具体。\n## 取舍清单\n采纳 Alpha', reasoning: '对照完了' }
    if (call.system.includes('终稿编辑')) return { text: '终稿：上下文要可检查。\n## 裁决摘要\n留下了例子，删了空话。', reasoning: '' }
    return { text: call.model + ' 的成稿', reasoning: call.model + '-think' }
  }
}

function waitFor(orchestrator, id, predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const run = orchestrator.get(id)
      if (run && predicate(run)) {
        clearInterval(timer)
        resolve(run)
      } else if (Date.now() - started > 2000) {
        clearInterval(timer)
        reject(new Error('timed out: ' + JSON.stringify(run && run.status)))
      }
    }, 10)
  })
}

test('council keeps every draft, then critique, then a final synthesis', async () => {
  const calls = []
  const orchestrator = createOrchestrator({ complete: fakeComplete(calls) })
  const parsed = parseRunInput(input(), catalog)
  assert.equal(parsed.ok, true)
  const started = orchestrator.start(parsed.value)
  const done = await waitFor(orchestrator, started.id, run => run.status === 'done')
  assert.deepEqual(done.candidates.map(item => item.status), ['done', 'done'])
  assert.match(done.candidates[0].text, /alpha 的成稿/)
  assert.match(done.critique.text, /交叉评审/)
  assert.match(done.synthesis.text, /裁决摘要/)
  assert.ok(done.events.some(event => event.message.includes('交叉评审')))
  assert.deepEqual(calls.map(call => call.model), ['alpha', 'beta', 'judge', 'judge'])
  orchestrator.dispose()
})

test('one failed drafter does not hide the drafts that succeeded', async () => {
  const orchestrator = createOrchestrator({ complete: fakeComplete([]) })
  const parsed = parseRunInput(input({
    models: [
      { provider: 'local-proxy', model: 'alpha' },
      { provider: 'local-proxy', model: 'bad' },
    ],
  }), catalog)
  const started = orchestrator.start(parsed.value)
  const done = await waitFor(orchestrator, started.id, run => run.status === 'done')
  assert.equal(done.candidates.find(item => item.model === 'bad').status, 'failed')
  assert.match(done.candidates.find(item => item.model === 'bad').error, /provider down/)
  assert.match(done.synthesis.text, /终稿/)
  orchestrator.dispose()
})

test('a council with no usable draft stops before the judge', async () => {
  const calls = []
  const orchestrator = createOrchestrator({
    complete: async (call) => {
      calls.push(call)
      throw new Error('provider down')
    },
  })
  const parsed = parseRunInput(input(), catalog)
  const started = orchestrator.start(parsed.value)
  const failed = await waitFor(orchestrator, started.id, run => run.status === 'failed')
  assert.match(failed.error, /没有产出可用内容/)
  assert.equal(calls.some(call => call.system.includes('裁判编辑')), false)
  orchestrator.dispose()
})

test('cancel stops a run that has not finished', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const orchestrator = createOrchestrator({
    complete: async (call) => {
      call.onDelta?.({ text: '写到一半', reasoning: '' })
      await gate
      if (call.signal.aborted) throw new Error('aborted')
      return { text: '不应该出现', reasoning: '' }
    },
  })
  const parsed = parseRunInput(input(), catalog)
  const started = orchestrator.start(parsed.value)
  await waitFor(orchestrator, started.id, run => run.candidates.some(item => item.text === '写到一半'))
  const cancelled = orchestrator.cancel(started.id)
  assert.equal(cancelled.status, 'cancelled')
  release()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(orchestrator.get(started.id).status, 'cancelled')
  assert.equal(orchestrator.get(started.id).synthesis.text, '')
  orchestrator.dispose()
})

test('routes refuse cross-site calls and serve a run snapshot', async () => {
  const calls = []
  const orchestrator = createOrchestrator({ complete: fakeComplete(calls) })
  const models = async () => ({ providers: [], models: catalog, errors: [] })
  const deps = { listModels: models, runs: orchestrator, parseRunInput }
  const denied = response()
  await handleWriterRequest(request({ method: 'GET', url: '/api/writer/health', site: 'cross-site', address: '8.8.8.8' }), denied, deps)
  assert.equal(denied.status, 403)
  assert.equal(isRequestAllowed(request({ method: 'GET', url: '/api/writer/health', site: 'same-origin' })), true)

  const created = response()
  await handleWriterRequest(request({
    method: 'POST',
    url: '/api/writer/runs',
    site: 'same-origin',
    body: JSON.stringify(input()),
  }), created, deps)
  assert.equal(created.status, 202)
  const body = JSON.parse(created.body)
  const finished = await waitFor(orchestrator, body.run.id, run => run.status === 'done')
  const read = response()
  await handleWriterRequest(request({
    method: 'GET',
    url: '/api/writer/runs/' + finished.id,
    site: 'same-origin',
  }), read, deps)
  assert.equal(read.status, 200)
  assert.match(JSON.parse(read.body).run.synthesis.text, /裁决摘要/)
  orchestrator.dispose()
})

test('a restarted host does not pretend an in-flight run is still running', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-writer-'))
  const file = join(dir, 'state.json')
  const first = createOrchestrator({
    dataFile: file,
    complete: async () => new Promise(() => {}),
  })
  const parsed = parseRunInput(input(), catalog)
  const started = first.start(parsed.value)
  first.dispose()
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  raw.runs[0].status = 'running'
  writeFileSync(file, JSON.stringify(raw))
  const second = createOrchestrator({
    dataFile: file,
    complete: async () => ({ text: 'no', reasoning: '' }),
  })
  assert.equal(second.get(started.id).status, 'failed')
  assert.match(second.get(started.id).error, /宿主重启/)
  second.dispose()
})

function response() {
  return {
    status: 0,
    body: '',
    writeHead(status) { this.status = status },
    end(payload) { this.body = payload },
  }
}

function request({ method, url, body, site, address }) {
  const chunks = body ? [Buffer.from(body)] : []
  return {
    method,
    url,
    headers: site ? { 'sec-fetch-site': site } : {},
    socket: { remoteAddress: address || '127.0.0.1' },
    destroy() {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

test('optimizeTopicPrompt and POST /api/writer/optimize return structured improvements', async () => {
  const prompt = optimizeTopicPrompt('聊聊微服务', '后端架构', 'rigorous')
  assert.match(prompt.system, /严谨技术/)
  assert.match(prompt.user, /聊聊微服务/)

  const parsed = parseOptimizedTopic('{"optimizedTopic":"深入剖析微服务拆分边界","suggestedFocus":"关注分布式事务与延迟","improvements":["补充了拆分边界","明确了技术指标"]}')
  assert.equal(parsed.optimizedTopic, '深入剖析微服务拆分边界')
  assert.equal(parsed.suggestedFocus, '关注分布式事务与延迟')
  assert.equal(parsed.improvements.length, 2)

  const res = response()
  await handleWriterRequest(
    request({
      method: 'POST',
      url: '/api/writer/optimize',
      site: 'same-origin',
      body: JSON.stringify({ topic: '聊聊微服务', focus: '后端', mode: 'rigorous' }),
    }),
    res,
    {
      listModels: async () => ({ providers: [], models: catalog, errors: [] }),
      runs: createOrchestrator({ complete: async () => ({ text: '', reasoning: '' }) }),
      parseRunInput,
      optimizeTopic: async (body) => ({
        optimizedTopic: '优化后：' + body.topic,
        suggestedFocus: '建议侧重：高可用',
        improvements: ['细化了架构指标'],
        model: 'local-proxy/alpha',
        modelName: 'Alpha',
      }),
    }
  )
  assert.equal(res.status, 200)
  const payload = JSON.parse(res.body)
  assert.equal(payload.optimizedTopic, '优化后：聊聊微服务')
  assert.equal(payload.suggestedFocus, '建议侧重：高可用')
})


test('GET /api/writer/runs/:id/markdown generates and saves markdown file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-writer-md-'))
  const orchestrator = createOrchestrator({ complete: fakeComplete([]) })
  const parsed = parseRunInput(input(), catalog)
  const started = orchestrator.start(parsed.value)
  const done = await waitFor(orchestrator, started.id, run => run.status === 'done')

  const res = response()
  await handleWriterRequest(
    request({
      method: 'GET',
      url: '/api/writer/runs/' + done.id + '/markdown?scope=final',
      site: 'same-origin',
    }),
    res,
    {
      listModels: async () => ({ providers: [], models: catalog, errors: [] }),
      runs: orchestrator,
      parseRunInput,
      outputDir: dir,
    }
  )
  assert.equal(res.status, 200)
  const data = JSON.parse(res.body)
  assert.match(data.fileName, /-final\.md$/)
  assert.match(data.markdown, /裁决摘要/)
  assert.equal(readFileSync(data.filePath, 'utf8'), data.markdown)
  orchestrator.dispose()
})
