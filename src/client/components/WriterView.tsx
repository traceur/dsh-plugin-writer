import React, { useState, useEffect } from 'react'
import type { ModelOption, ConsensusSession, CandidateGeneration } from '../../types.js'

export function WriterView() {
  const [models, setModels] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  
  const [topic, setTopic] = useState('')
  const [requirements, setRequirements] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [judgeModel, setJudgeModel] = useState<string>('')
  
  const [currentSession, setCurrentSession] = useState<ConsensusSession | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'generate' | 'critique' | 'synthesis'>('generate')

  // 加载模型列表
  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    setLoadingModels(true)
    try {
      const res = await fetch('/consensus/api/models')
      const data = await res.json()
      if (data.ok && Array.isArray(data.models)) {
        setModels(data.models)
        if (data.models.length > 0) {
          // 默认选择前两个或三个模型作为生成模型
          const ids = data.models.slice(0, 3).map((m: ModelOption) => `${m.provider}::${m.id}`)
          setSelectedModels(ids)
          // 默认选择第一个为裁判模型
          setJudgeModel(`${data.models[0].provider}::${data.models[0].id}`)
        }
      }
    } catch (e) {
      console.error('Failed to fetch models', e)
    } finally {
      setLoadingModels(false)
    }
  }

  // 轮询当前会话状态
  useEffect(() => {
    if (!currentSession || !isRunning) return

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/consensus/api/session/${currentSession.id}`)
        const data = await res.json()
        if (data.ok && data.session) {
          setCurrentSession(data.session)
          if (data.session.status === 'completed' || data.session.status === 'error') {
            setIsRunning(false)
            if (data.session.status === 'completed') {
              setActiveTab('synthesis')
            }
          }
        }
      } catch (err) {
        console.error('Failed to poll session', err)
      }
    }, 1500)

    return () => clearInterval(timer)
  }, [currentSession?.id, isRunning])

  const toggleModelSelection = (key: string) => {
    if (selectedModels.includes(key)) {
      if (selectedModels.length > 1) {
        setSelectedModels(selectedModels.filter(k => k !== key))
      }
    } else {
      setSelectedModels([...selectedModels, key])
    }
  }

  const handleStart = async () => {
    if (!topic.trim()) return
    if (selectedModels.length === 0 || !judgeModel) return

    setIsRunning(true)
    setActiveTab('generate')

    const chosenModels = selectedModels.map(key => {
      const [provider, modelId] = key.split('::')
      return { provider, modelId }
    })
    const [jProvider, jModelId] = judgeModel.split('::')

    try {
      const res = await fetch('/consensus/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          requirements: requirements.trim() || undefined,
          models: chosenModels,
          judgeModel: { provider: jProvider, modelId: jModelId }
        })
      })
      const data = await res.json()
      if (data.ok && data.session) {
        setCurrentSession(data.session)
      } else {
        alert(data.error || '启动失败')
        setIsRunning(false)
      }
    } catch (err: any) {
      alert('请求错误: ' + err.message)
      setIsRunning(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--dsh-bg-main, #1e1e24)',
      color: 'var(--dsh-text-primary, #e2e8f0)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '16px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      {/* 顶部标题区 */}
      <div style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚖️</span> 多模型碰撞 & 裁判提炼 (Consensus Synthesizer)
        </h2>
        <p style={{ margin: 0, fontSize: '13px', opacity: 0.7 }}>
          引入多个候选模型针对同一命题独立产出，通过裁判模型深度交叉审校，取精去糟，输出高品质终稿。
        </p>
      </div>

      {/* 配置面板 */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {/* 主题与要求 */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            创作命题 / 主题内容：
          </label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={isRunning}
            placeholder="例如：请分析微服务与单体架构在当下的选型权衡，并给出落地建议..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            附加要求 / 约束条件（可选）：
          </label>
          <input
            type="text"
            value={requirements}
            onChange={e => setRequirements(e.target.value)}
            disabled={isRunning}
            placeholder="例如：字数约 1500 字，要求举具体技术栈案例，逻辑严谨客观..."
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* 模型选择网格 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* 生成模型（多选） */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
              参选生成模型（多选）：
            </label>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              maxHeight: '110px',
              overflowY: 'auto',
              padding: '8px',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '6px'
            }}>
              {models.map(m => {
                const key = `${m.provider}::${m.id}`
                const isSelected = selectedModels.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isRunning}
                    onClick={() => toggleModelSelection(key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                      color: isSelected ? '#60a5fa' : 'inherit'
                    }}
                  >
                    {isSelected ? '✓ ' : ''}{m.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 裁判模型（单选） */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
              首席裁判模型（单选）：
            </label>
            <select
              value={judgeModel}
              onChange={e => setJudgeModel(e.target.value)}
              disabled={isRunning}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                fontSize: '13px'
              }}
            >
              {models.map(m => {
                const key = `${m.provider}::${m.id}`
                return (
                  <option key={key} value={key}>
                    {m.provider} / {m.name}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {/* 开始按钮 */}
        <button
          onClick={handleStart}
          disabled={isRunning || !topic.trim() || selectedModels.length === 0}
          style={{
            padding: '10px 24px',
            borderRadius: '6px',
            border: 'none',
            background: isRunning ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6',
            color: '#fff',
            fontWeight: 600,
            fontSize: '14px',
            cursor: isRunning || !topic.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {isRunning ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              正在流水线处理中... ({currentSession?.status === 'generating' ? '各模型并行产出中' : '裁判审校提炼中'})
            </>
          ) : (
            <>🚀 启动多模型产出与裁判提炼</>
          )}
        </button>
      </div>

      {/* 结果与过程视窗 */}
      {currentSession && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Tab 导航切换 */}
          <div style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            marginBottom: '14px'
          }}>
            <button
              onClick={() => setActiveTab('generate')}
              style={{
                padding: '8px 16px',
                background: activeTab === 'generate' ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'generate' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'generate' ? '#60a5fa' : 'inherit',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              1. 候选模型并行产出 ({currentSession.candidates.length})
            </button>

            <button
              onClick={() => setActiveTab('critique')}
              style={{
                padding: '8px 16px',
                background: activeTab === 'critique' ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'critique' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'critique' ? '#60a5fa' : 'inherit',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              2. 中间过程：审校优劣与取精去糟
            </button>

            <button
              onClick={() => setActiveTab('synthesis')}
              style={{
                padding: '8px 16px',
                background: activeTab === 'synthesis' ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'synthesis' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'synthesis' ? '#60a5fa' : 'inherit',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500
              }}
            >
              3. 裁判综合终稿 ✨
            </button>
          </div>

          {/* Tab 1: 候选模型原始输出瀑布流 */}
          {activeTab === 'generate' && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(currentSession.candidates.length, 3)}, 1fr)`, gap: '14px', flex: 1, overflowY: 'auto' }}>
              {currentSession.candidates.map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{c.modelId}</span>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: c.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : c.status === 'running' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255,255,255,0.1)',
                      color: c.status === 'completed' ? '#4ade80' : c.status === 'running' ? '#facc15' : 'inherit'
                    }}>
                      {c.status === 'completed' ? `完成 (${(c.durationMs! / 1000).toFixed(1)}s)` : c.status === 'running' ? '生成中...' : c.status}
                    </span>
                  </div>
                  <div style={{
                    flex: 1,
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    overflowY: 'auto',
                    maxHeight: '400px'
                  }}>
                    {c.content || (c.error ? `错误: ${c.error}` : '等待生成...')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: 审校对比与取精去糟清单 */}
          {activeTab === 'critique' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
              {currentSession.judgeResult.status !== 'completed' ? (
                <div style={{ padding: '24px', textAlign: 'center', opacity: 0.7 }}>
                  {currentSession.judgeResult.status === 'running' ? '裁判正在通读各模型产出，交叉比对优劣...' : '尚未开始审校'}
                </div>
              ) : (
                <>
                  {/* 各模型审校 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                    {currentSession.judgeResult.critiques.map((critique, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          padding: '12px'
                        }}
                      >
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#60a5fa' }}>
                          📌 {critique.modelId} 评审结论
                        </h4>
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>🌟 亮点与精髓：</span>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px', opacity: 0.9 }}>
                            {critique.strengths.map((s, si) => <li key={si}>{s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>⚠️ 不足与糟粕：</span>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px', opacity: 0.8 }}>
                            {critique.weaknesses.map((w, wi) => <li key={wi}>{w}</li>)}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 取精去糟明细 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '14px',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#4ade80' }}>
                        ✅ 最终采纳的精华点清单：
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: '1.6' }}>
                        {currentSession.judgeResult.extractedEssence.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#f87171' }}>
                        ❌ 被裁判剔除的糟粕与弃用说明：
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: '1.6', opacity: 0.85 }}>
                        {currentSession.judgeResult.discardedPoints.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 3: 裁判综合终稿 */}
          {activeTab === 'synthesis' && (
            <div style={{
              flex: 1,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>
                  🏆 裁判最终提炼成文
                </span>
                {currentSession.judgeResult.finalSynthesis && (
                  <button
                    onClick={() => navigator.clipboard.writeText(currentSession.judgeResult.finalSynthesis)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    📋 一键复制终稿
                  </button>
                )}
              </div>

              <div style={{
                flex: 1,
                background: 'rgba(0,0,0,0.25)',
                borderRadius: '6px',
                padding: '16px',
                fontSize: '14px',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                overflowY: 'auto'
              }}>
                {currentSession.judgeResult.finalSynthesis || (currentSession.judgeResult.status === 'running' ? '裁判正在斟酌打磨终稿，请稍候...' : '暂无终稿')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}