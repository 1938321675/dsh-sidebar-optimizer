/**
 * 侧栏优化插件——「更多」菜单管理行与状态订阅的测试。
 *
 * 管理行的语义：显示中的入口点一下收起；已收起的入口点一下恢复并打开，
 * 保证任何入口都不会因为被收起而失去入口。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadClient, makeStorage } from './harness.mjs'

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

async function api(storage) {
  const { exports } = await loadClient(CLIENT, storage)
  return exports.__internals
}

const panels = [
  { id: 'dsh-context', label: '上下文洞察' },
  { id: 'dsh-mnemon', label: '记忆系统' },
]

test('manageRows：显示中的入口标记为可见', async () => {
  const { manageRows } = await api()
  assert.deepEqual(manageRows(panels, []), [
    { id: 'dsh-context', label: '上下文洞察', visible: true },
    { id: 'dsh-mnemon', label: '记忆系统', visible: true },
  ])
})

test('manageRows：被收起的入口标记为不可见', async () => {
  const { manageRows } = await api()
  assert.deepEqual(
    manageRows(panels, ['dsh-mnemon']).map((row) => row.visible),
    [true, false],
  )
})

test('manageRows：忽略非法项，并挡住受保护的插件入口', async () => {
  const { manageRows } = await api()
  const rows = manageRows(
    [
      { id: 'plugins', label: '插件' },
      { id: '', label: '无 id' },
      { id: 'ok', label: '  正常  ' },
      null,
    ],
    [],
  )
  assert.deepEqual(rows, [{ id: 'ok', label: '正常', visible: true }])
})

test('manageRows：entries 不是数组时返回空', async () => {
  const { manageRows } = await api()
  assert.deepEqual(manageRows(undefined, []), [])
})

test('store：初始状态来自 localStorage', async () => {
  const { createStore } = await api(
    makeStorage({ 'dsh-sidebar-optimizer:v1': JSON.stringify({ collapsed: true, hidden: ['dsh-mnemon'] }) }),
  )
  const store = createStore()
  assert.deepEqual(store.get(), { collapsed: true, hidden: ['dsh-mnemon'] })
})

test('store：切换折叠会写回 localStorage 并通知订阅者', async () => {
  const storage = makeStorage()
  const { createStore, STORAGE_KEY } = await api(storage)
  const store = createStore()
  const seen = []
  store.subscribe((state) => seen.push(state.collapsed))
  store.setCollapsed(true)
  assert.deepEqual(seen, [true])
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { collapsed: true, hidden: [] })
})

test('store：退订后不再收到通知', async () => {
  const { createStore } = await api()
  const store = createStore()
  const seen = []
  const unsubscribe = store.subscribe(() => seen.push(1))
  store.setCollapsed(true)
  unsubscribe()
  store.setCollapsed(false)
  assert.equal(seen.length, 1)
})

test('store：收起与恢复走同一套规则，插件入口不受影响', async () => {
  const { createStore } = await api()
  const store = createStore()
  store.setHidden('plugins', true)
  assert.deepEqual(store.get().hidden, [])
  store.setHidden('dsh-mnemon', true)
  store.setHidden('dsh-context', true)
  store.setHidden('dsh-mnemon', false)
  assert.deepEqual(store.get().hidden, ['dsh-context'])
})
