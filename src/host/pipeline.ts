import type { Context } from '@deepseek-ai/cordis'
import { LlmDispatcher } from './llm-dispatcher.js'
import { buildJudgePrompt, parseJudgeOutput } from './judge-prompts.js'
import type { ConsensusSession, StartConsensusRequest } from '../types.js'

export class PipelineManager {
  private dispatcher: LlmDispatcher
  private sessions = new Map<string, ConsensusSession>()

  constructor(private ctx: Context) {
    this.dispatcher = new LlmDispatcher(ctx)
  }

  getDispatcher(): LlmDispatcher {
    return this.dispatcher
  }

  getSession(id: string): ConsensusSession | undefined {
    return this.sessions.get(id)
  }

  listSessions(): ConsensusSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async startConsensus(req: StartConsensusRequest): Promise<ConsensusSession> {
    const sessionId = 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)

    const session: ConsensusSession = {
      id: sessionId,
      topic: req.topic,
      requirements: req.requirements,
      judgeModel: req.judgeModel,
      candidates: req.models.map(m => ({
        provider: m.provider,
        modelId: m.modelId,
        status: 'pending',
        content: ''
      })),
      judgeResult: {
        status: 'pending',
        critiques: [],
        extractedEssence: [],
        discardedPoints: [],
        finalSynthesis: '',
        rawJudgeOutput: ''
      },
      createdAt: Date.now(),
      status: 'generating'
    }

    this.sessions.set(sessionId, session)

    // 异步启动生成和裁判流水线
    void this.executePipeline(session)

    return session
  }

  private async executePipeline(session: ConsensusSession) {
    try {
      // 阶段 1：多模型并行产出
      const candidatePromises = session.candidates.map(async (candidate) => {
        candidate.status = 'running'
        const startTime = Date.now()
        try {
          const userPrompt = session.requirements
            ? `【主题】：${session.topic}\n\n【要求】：${session.requirements}`
            : session.topic

          candidate.content = await this.dispatcher.generateText(
            candidate.provider,
            candidate.modelId,
            userPrompt,
            '请针对用户的主题与要求进行专业、深刻、结构清晰的回答与内容创作。'
          )
          candidate.status = 'completed'
          candidate.durationMs = Date.now() - startTime
        } catch (err: any) {
          candidate.status = 'error'
          candidate.error = err.message || String(err)
          candidate.durationMs = Date.now() - startTime
        }
      })

      await Promise.all(candidatePromises)

      // 检查是否有成功的候选产出
      const validCandidates = session.candidates.filter(c => c.status === 'completed' && c.content)
      if (validCandidates.length === 0) {
        session.status = 'error'
        session.error = '所有候选模型生成均失败，请检查模型可用性'
        return
      }

      // 阶段 2：裁判模型介入评审与合成
      session.status = 'judging'
      session.judgeResult.status = 'running'
      const judgeStartTime = Date.now()

      const judgePrompt = buildJudgePrompt(
        session.topic,
        session.requirements,
        validCandidates
      )

      try {
        const rawJudgeOutput = await this.dispatcher.generateText(
          session.judgeModel.provider,
          session.judgeModel.modelId,
          judgePrompt,
          '你是一名极为客观公正、擅长提炼精髓与去伪存真的裁判官兼总主编。'
        )

        const parsed = parseJudgeOutput(rawJudgeOutput)
        session.judgeResult = {
          status: 'completed',
          durationMs: Date.now() - judgeStartTime,
          ...parsed
        }
        session.status = 'completed'
      } catch (judgeErr: any) {
        session.judgeResult.status = 'error'
        session.judgeResult.error = judgeErr.message || String(judgeErr)
        session.status = 'error'
        session.error = `裁判模型执行失败: ${judgeErr.message || String(judgeErr)}`
      }
    } catch (globalErr: any) {
      session.status = 'error'
      session.error = globalErr.message || String(globalErr)
    }
  }
}
