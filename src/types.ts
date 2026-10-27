export interface ModelOption {
  provider: string
  id: string
  name: string
  displayName?: string
}

export interface CandidateGeneration {
  modelId: string
  provider: string
  status: 'pending' | 'running' | 'completed' | 'error'
  content: string
  error?: string
  durationMs?: number
  tokenCount?: number
}

export interface ModelCritique {
  modelId: string
  strengths: string[]
  weaknesses: string[]
  uniqueInsights: string[]
  discardedReasons?: string[]
}

export interface JudgeResult {
  status: 'pending' | 'running' | 'completed' | 'error'
  critiques: ModelCritique[]
  extractedEssence: string[]
  discardedPoints: string[]
  finalSynthesis: string
  rawJudgeOutput: string
  error?: string
  durationMs?: number
}

export interface ConsensusSession {
  id: string
  topic: string
  requirements?: string
  judgeModel: { provider: string; modelId: string }
  candidates: CandidateGeneration[]
  judgeResult: JudgeResult
  createdAt: number
  status: 'idle' | 'generating' | 'judging' | 'completed' | 'error'
  error?: string
}

export interface StartConsensusRequest {
  topic: string
  requirements?: string
  models: { provider: string; modelId: string }[]
  judgeModel: { provider: string; modelId: string }
}
