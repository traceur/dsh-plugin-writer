// Draft only. The mounted plugin is lib/index.js; this file is not the package entry.
import type { Context } from '@deepseek-ai/cordis'
import { PipelineManager } from './host/pipeline.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dsh-plugin-writer'
export const inject = ['webServer', 'llm']

export function apply(ctx: Context) {
  const pipeline = new PipelineManager(ctx)

  // 辅助函数：解析 json body
  async function readJson(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', chunk => { data += chunk })
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {})
        } catch (e) {
          reject(e)
        }
      })
      req.on('error', reject)
    })
  }

  function writeJson(res: ServerResponse, status: number, data: any) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end(JSON.stringify(data))
  }

  // 注册 HTTP API 路由
  ctx.effect(() => {
    const webServer = ctx.get('webServer') as any
    if (!webServer) return () => {}

    const unreg = webServer.register({
      kind: 'prefix',
      path: '/consensus/api',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '', 'http://127.0.0.1')
        const pathname = url.pathname

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          })
          res.end()
          return
        }

        try {
          // 1. 获取可用模型列表
          if (pathname === '/consensus/api/models' && req.method === 'GET') {
            const models = await pipeline.getDispatcher().listAvailableModels()
            writeJson(res, 200, { ok: true, models })
            return
          }

          // 2. 发起多模型共识与裁判任务
          if (pathname === '/consensus/api/start' && req.method === 'POST') {
            const body = await readJson(req)
            if (!body.topic || !body.models || !body.judgeModel) {
              writeJson(res, 400, { ok: false, error: '缺少 topic、models 或 judgeModel 参数' })
              return
            }
            const session = await pipeline.startConsensus(body)
            writeJson(res, 200, { ok: true, session })
            return
          }

          // 3. 查询特定会话状态与结果（支持轮询）
          if (pathname.startsWith('/consensus/api/session/') && req.method === 'GET') {
            const sessionId = pathname.replace('/consensus/api/session/', '')
            const session = pipeline.getSession(sessionId)
            if (!session) {
              writeJson(res, 404, { ok: false, error: 'Session not found' })
              return
            }
            writeJson(res, 200, { ok: true, session })
            return
          }

          // 4. 获取历史任务列表
          if (pathname === '/consensus/api/sessions' && req.method === 'GET') {
            const sessions = pipeline.listSessions()
            writeJson(res, 200, { ok: true, sessions })
            return
          }

          writeJson(res, 404, { ok: false, error: 'Not found' })
        } catch (err: any) {
          console.error('[dsh-writer] API Error:', err)
          writeJson(res, 500, { ok: false, error: err.message || String(err) })
        }
      }
    })

    return () => {
      if (typeof unreg === 'function') unreg()
    }
  }, 'dsh-plugin-writer: webServer routes')

  console.log('[dsh-plugin-writer] Host plugin loaded successfully!')
}