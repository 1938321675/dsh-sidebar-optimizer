/**
 * 侧栏优化插件——可持久化状态的纯逻辑测试。
 * 这些规则决定"哪些入口被收起""整块是否折叠"，是插件里唯一有分支的部分。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadClient, makeStorage } from './harness.mjs'

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

async function api() {
  const { exports } = await loadClient(CLIENT)
  assert.ok(exports.__internals, 'client.js 必须导出 __internals 供测试使用')
  return exports.__internals
}

test('parseState：读不到内容时返回默认状态', async () => {
  const { parseState } = await api()
  assert.deepEqual(parseState(null), { collapsed: false, hidden: [] })
})

test('parseState：内容不是合法 JSON 时返回默认状态', async () => {
  const { parseState } = await api()
  assert.deepEqual(parseState('{不是 json'), { collapsed: false, hidden: [] })
})

test('parseState：读出已保存的折叠态与收起列表', async () => {
  const { parseState } = await api()
  const raw = JSON.stringify({ collapsed: true, hidden: ['dsh-context', 'dsh-mnemon'] })
  assert.deepEqual(parseState(raw), { collapsed: true, hidden: ['dsh-context', 'dsh-mnemon'] })
})

test('parseState：字段类型不对时逐项回退，不整体丢弃', async () => {
  const { parseState } = await api()
  const raw = JSON.stringify({ collapsed: 'yes', hidden: ['dsh-context', 42, null, ''] })
  assert.deepEqual(parseState(raw), { collapsed: false, hidden: ['dsh-context'] })
})

test('parseState：收起列表去重', async () => {
  const { parseState } = await api()
  const raw = JSON.stringify({ hidden: ['a', 'a', 'b'] })
  assert.deepEqual(parseState(raw).hidden, ['a', 'b'])
})

test('parseState：插件入口不允许被收起', async () => {
  const { parseState } = await api()
  const raw = JSON.stringify({ hidden: ['plugins', 'dsh-context'] })
  assert.deepEqual(parseState(raw).hidden, ['dsh-context'])
})

test('parseState：未知字段被丢弃', async () => {
  const { parseState } = await api()
  const raw = JSON.stringify({ collapsed: true, hidden: [], 注入: '恶意' })
  assert.deepEqual(parseState(raw), { collapsed: true, hidden: [] })
})

test('serializeState 与 parseState 往返一致', async () => {
  const { parseState, serializeState } = await api()
  const state = { collapsed: true, hidden: ['dsh-mnemon'] }
  assert.deepEqual(parseState(serializeState(state)), state)
})

test('toggleHidden：收起一个入口', async () => {
  const { toggleHidden } = await api()
  assert.deepEqual(toggleHidden([], 'dsh-context', true), ['dsh-context'])
})

test('toggleHidden：恢复一个入口', async () => {
  const { toggleHidden } = await api()
  assert.deepEqual(toggleHidden(['dsh-context', 'dsh-mnemon'], 'dsh-context', false), ['dsh-mnemon'])
})

test('toggleHidden：重复收起不产生重复项', async () => {
  const { toggleHidden } = await api()
  assert.deepEqual(toggleHidden(['dsh-context'], 'dsh-context', true), ['dsh-context'])
})

test('toggleHidden：插件入口始终无法被收起', async () => {
  const { toggleHidden } = await api()
  assert.deepEqual(toggleHidden([], 'plugins', true), [])
})

test('isHidden：插件入口永远不隐藏，其余按列表判断', async () => {
  const { isHidden } = await api()
  assert.equal(isHidden('plugins', ['plugins']), false)
  assert.equal(isHidden('dsh-context', ['dsh-context']), true)
  assert.equal(isHidden('dsh-mnemon', ['dsh-context']), false)
})

test('readState/writeState：共用同一个 localStorage 键，读到刚写入的状态', async () => {
  const { exports } = await loadClient(CLIENT, makeStorage())
  const { readState, writeState, STORAGE_KEY } = exports.__internals
  writeState({ collapsed: true, hidden: ['dsh-context'] })
  assert.deepEqual(readState(), { collapsed: true, hidden: ['dsh-context'] })
  assert.ok(STORAGE_KEY.startsWith('dsh-sidebar-optimizer'))
})
