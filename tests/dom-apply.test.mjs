/**
 * 侧栏优化插件——把状态真正打到导航区 DOM 上的行为测试。
 *
 * 这一层最容易出问题的地方是幂等与自愈：React 每次重渲染都可能重建导航区，
 * 插件必须能反复应用而不会堆出多个折叠条，也不会把标记留在已经恢复的行上。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadClient } from './harness.mjs'
import { createDocument, createNav } from './fake-dom.mjs'

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

async function api() {
  const { exports } = await loadClient(CLIENT)
  return exports.__internals
}

/** 造一个和真实侧栏同形的导航区：插件 / 上下文洞察 / 记忆系统 / 更多。 */
function scene() {
  const doc = createDocument()
  const nav = createNav(doc, ['插件', '上下文洞察', '记忆系统', '更多'])
  return { doc, nav }
}

const planOf = (hiddenLabels) => [
  { id: 'plugins', label: '插件', hidden: hiddenLabels.includes('插件') },
  { id: 'dsh-context', label: '上下文洞察', hidden: hiddenLabels.includes('上下文洞察') },
  { id: 'dsh-mnemon', label: '记忆系统', hidden: hiddenLabels.includes('记忆系统') },
]

function rowByLabel(nav, label) {
  return nav.querySelectorAll('button').find((button) => button.getAttribute('aria-label') === label)
}

test('被收起的入口行打上隐藏标记，其余行不动', async () => {
  const { applySidebarState, HIDDEN_ATTR } = await api()
  const { nav } = scene()
  applySidebarState(nav, { plan: planOf(['记忆系统']), collapsed: false, onToggle: () => {} })
  assert.equal(rowByLabel(nav, '记忆系统').getAttribute(HIDDEN_ATTR), 'true')
  assert.equal(rowByLabel(nav, '上下文洞察').hasAttribute(HIDDEN_ATTR), false)
})

test('入口恢复后隐藏标记被移除', async () => {
  const { applySidebarState, HIDDEN_ATTR } = await api()
  const { nav } = scene()
  const options = { collapsed: false, onToggle: () => {} }
  applySidebarState(nav, { ...options, plan: planOf(['记忆系统']) })
  applySidebarState(nav, { ...options, plan: planOf([]) })
  assert.equal(rowByLabel(nav, '记忆系统').hasAttribute(HIDDEN_ATTR), false)
})

test('计划之外的行（「更多」）不受影响', async () => {
  const { applySidebarState, HIDDEN_ATTR } = await api()
  const { nav } = scene()
  applySidebarState(nav, { plan: planOf(['记忆系统', '上下文洞察']), collapsed: false, onToggle: () => {} })
  assert.equal(rowByLabel(nav, '更多').hasAttribute(HIDDEN_ATTR), false)
})

test('折叠时给导航区打折叠标记，展开时移除', async () => {
  const { applySidebarState, COLLAPSED_ATTR } = await api()
  const { nav } = scene()
  const base = { plan: planOf([]), onToggle: () => {} }
  applySidebarState(nav, { ...base, collapsed: true })
  assert.equal(nav.getAttribute(COLLAPSED_ATTR), 'true')
  applySidebarState(nav, { ...base, collapsed: false })
  assert.equal(nav.hasAttribute(COLLAPSED_ATTR), false)
})

test('反复应用只保留一个折叠条', async () => {
  const { applySidebarState, BAR_ATTR } = await api()
  const { doc, nav } = scene()
  const options = { plan: planOf([]), collapsed: false, onToggle: () => {} }
  applySidebarState(nav, options)
  applySidebarState(nav, options)
  applySidebarState(nav, options)
  assert.equal(doc.body.querySelectorAll(`[${BAR_ATTR}]`).length, 1)
})

test('折叠条位于导航区之前，且跟随导航区一起重建', async () => {
  const { applySidebarState, BAR_ATTR } = await api()
  const { doc, nav } = scene()
  applySidebarState(nav, { plan: planOf([]), collapsed: false, onToggle: () => {} })
  const firstBar = nav.previousElementSibling
  assert.equal(firstBar.getAttribute(BAR_ATTR), 'true')

  // React 重建整块：导航区连同我们插在它前面的折叠条一起消失。
  const rebuilt = createNav(doc, ['插件', '上下文洞察', '记忆系统', '更多'])
  doc.body.removeChild(nav)
  doc.body.removeChild(firstBar)
  assert.equal(rebuilt.previousElementSibling, null)

  applySidebarState(rebuilt, { plan: planOf([]), collapsed: true, onToggle: () => {} })
  assert.equal(rebuilt.previousElementSibling.getAttribute(BAR_ATTR), 'true')
  assert.equal(doc.body.querySelectorAll(`[${BAR_ATTR}]`).length, 1)
})

test('状态没变时重复应用不再写折叠条文案（否则观察器会自激）', async () => {
  const { applySidebarState, BAR_ATTR } = await api()
  const { doc, nav } = scene()
  const options = { plan: planOf(['记忆系统']), collapsed: false, onToggle: () => {} }
  applySidebarState(nav, options)
  const bar = doc.body.querySelectorAll(`[${BAR_ATTR}]`)[0]
  const writesAfterFirst = bar.textWrites
  applySidebarState(nav, options)
  applySidebarState(nav, options)
  assert.equal(bar.textWrites, writesAfterFirst)
})

test('点击折叠条触发回调，回调拿到的是当前状态的反面', async () => {  const { applySidebarState, BAR_ATTR } = await api()
  const { doc, nav } = scene()
  const seen = []
  applySidebarState(nav, { plan: planOf([]), collapsed: false, onToggle: (next) => seen.push(next) })
  doc.body.querySelectorAll(`[${BAR_ATTR}]`)[0].click()
  assert.deepEqual(seen, [true])

  applySidebarState(nav, { plan: planOf([]), collapsed: true, onToggle: (next) => seen.push(next) })
  doc.body.querySelectorAll(`[${BAR_ATTR}]`)[0].click()
  assert.deepEqual(seen, [true, false])
})

test('折叠条文案反映当前是展开还是收起', async () => {
  const { applySidebarState, BAR_ATTR } = await api()
  const { doc, nav } = scene()
  applySidebarState(nav, { plan: planOf([]), collapsed: false, onToggle: () => {} })
  const expanded = doc.body.querySelectorAll(`[${BAR_ATTR}]`)[0].textContent
  applySidebarState(nav, { plan: planOf([]), collapsed: true, onToggle: () => {} })
  const collapsed = doc.body.querySelectorAll(`[${BAR_ATTR}]`)[0].textContent
  assert.ok(expanded.includes('全局面板'))
  assert.ok(collapsed.includes('全局面板'))
  assert.notEqual(expanded, collapsed)
})

test('导航区没有父节点时不抛错，只是不插折叠条', async () => {
  const { applySidebarState, HIDDEN_ATTR } = await api()
  const doc = createDocument()
  const orphan = doc.createElement('nav')
  const row = doc.createElement('button')
  row.setAttribute('aria-label', '记忆系统')
  orphan.appendChild(row)
  applySidebarState(orphan, {
    plan: planOf(['记忆系统']),
    collapsed: true,
    onToggle: () => {},
  })
  assert.equal(row.getAttribute(HIDDEN_ATTR), 'true')
})

test('外来的「网页对话」入口被搬进面板区，成为第一项', async () => {
  const { adoptChatEntry } = await api()
  const doc = createDocument()
  const nav = createNav(doc, ['插件', '更多'])
  const entry = doc.createElement('div')
  doc.body.insertBefore(entry, nav) // 它本来挂在「新会话」下方
  assert.equal(adoptChatEntry(nav, entry), true)
  assert.equal(entry.parentNode, nav)
  assert.equal(nav.firstElementChild, entry)
})

test('入口已经在面板区里时保持原位', async () => {
  const { adoptChatEntry } = await api()
  const doc = createDocument()
  const nav = createNav(doc, ['插件', '更多'])
  const entry = doc.createElement('div')
  nav.appendChild(entry)
  const order = nav.childNodes.slice()
  assert.equal(adoptChatEntry(nav, entry), false)
  assert.deepEqual(nav.childNodes, order)
})

test('入口不存在时什么也不做', async () => {
  const { adoptChatEntry } = await api()
  const doc = createDocument()
  const nav = createNav(doc, ['插件'])
  assert.equal(adoptChatEntry(nav, null), false)
  assert.equal(adoptChatEntry(nav, undefined), false)
  assert.equal(adoptChatEntry(null, doc.createElement('div')), false)
})
