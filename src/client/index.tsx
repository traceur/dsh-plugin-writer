import type { Context } from '@deepseek-ai/cordis'
import React from 'react'
import { WriterView } from './components/WriterView.js'

export const TAB_ID = 'consensus-writer'

export function apply(ctx: Context) {
  // 注入到 DSH 右侧面板标签页系统 (sidebarRightTabs)
  ctx.inject(['sidebarRightTabs', 'slots'], (injected) => {
    const tabs = injected.get('sidebarRightTabs') as any
    if (tabs && typeof tabs.register === 'function') {
      injected.effect(() => tabs.register({
        id: TAB_ID,
        title: () => '多模型碰撞与裁判',
        tooltip: () => '多模型产出、裁判对比与提炼整合',
        icon: 'scale',
        order: 55,
      }), 'dsh-plugin-writer: tab registration')
    }

    // 挂载视图到 sidebar.right.pane.tab
    injected.effect(() => {
      return injected.slots.inject('sidebar.right.pane.tab', () => injected.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
      }, WriterView))
    }, 'dsh-plugin-writer: view mounting')

    // 挂载 Tab 标题栏
    injected.effect(() => {
      return injected.slots.inject('sidebar.right.pane.tab.title', () => injected.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: TAB_ID,
      }, () => <span>⚖️ 裁判提炼</span>))
    }, 'dsh-plugin-writer: title mounting')
  })

  console.log('[dsh-plugin-writer] Client plugin registered successfully!')
}
