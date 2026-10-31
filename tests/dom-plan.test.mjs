/**
 * 侧栏优化插件——把"收起状态"翻译成"每一行要不要隐藏"的决策测试。
 *
 * 导航区里的每一行只有本地化 label（没有 id），所以插件用菜单拿到的
 * entries（id + label）建索引，再把状态映射到行上。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadClient } from './harness.mjs'

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

async function api() {
  const { exports } = await loadClient(CLIENT)
  return exports.__internals
}

const entries = [
  { id: 'plugins', label: '插件' },
  { id: 'dsh-context', label: '上下文洞察' },
  { id: 'dsh-mnemon', label: '记忆系统' },
]

test('buildLabelIndex：按 label 找到入口 id', async () => {
  const { buildLabelIndex } = await api()
  const index = buildLabelIndex(entries)
  assert.equal(index['上下文洞察'], 'dsh-context')
  assert.equal(index['记忆系统'], 'dsh-mnemon')
})

test('buildLabelIndex：忽略非法项与空 label', async () => {
  const { buildLabelIndex } = await api()
  const index = buildLabelIndex([
    { id: 'a', label: '  ' },
    { id: '', label: '无 id' },
    { label: '无 id 字段' },
    null,
    { id: 'b', label: '正常' },
  ])
  assert.deepEqual(Object.keys(index), ['正常'])
  assert.equal(index['正常'], 'b')
})

test('buildLabelIndex：重复 label 时保留先出现的 id', async () => {
  const { buildLabelIndex } = await api()
  const index = buildLabelIndex([
    { id: 'first', label: '重名' },
    { id: 'second', label: '重名' },
  ])
  assert.equal(index['重名'], 'first')
})

test('visibilityPlan：标记被收起的入口，保留原顺序', async () => {
  const { visibilityPlan } = await api()
  const plan = visibilityPlan(entries, ['dsh-mnemon'])
  assert.deepEqual(plan, [
    { id: 'plugins', label: '插件', hidden: false },
    { id: 'dsh-context', label: '上下文洞察', hidden: false },
    { id: 'dsh-mnemon', label: '记忆系统', hidden: true },
  ])
})

test('visibilityPlan：受保护入口即使列在收起列表里也不隐藏', async () => {
  const { visibilityPlan } = await api()
  const plan = visibilityPlan(entries, ['plugins'])
  assert.equal(plan.find((row) => row.id === 'plugins').hidden, false)
})

test('visibilityPlan：收起列表里的未知 id 不影响结果', async () => {
  const { visibilityPlan } = await api()
  const plan = visibilityPlan(entries, ['已经卸载的插件'])
  assert.deepEqual(plan.map((row) => row.hidden), [false, false, false])
})

test('visibilityPlan：entries 为空时返回空计划', async () => {
  const { visibilityPlan } = await api()
  assert.deepEqual(visibilityPlan([], ['dsh-context']), [])
})
