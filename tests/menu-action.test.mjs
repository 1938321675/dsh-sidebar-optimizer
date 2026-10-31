/**
 * 侧栏优化插件——「更多」菜单里点一行会发生什么的测试。
 *
 * 规则：显示中的入口点一下收起（菜单留在原地，方便连续整理）；
 * 已收起的入口点一下恢复并打开（保证入口不会因为被收起而消失）。
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

function recorder() {
  const calls = []
  return {
    calls,
    setHidden: (id, hide) => calls.push(['setHidden', id, hide]),
    open: (id) => calls.push(['open', id]),
  }
}

test('点显示中的入口：收起它，菜单不关', async () => {
  const { activateMenuRow } = await api()
  const actions = recorder()
  const closed = activateMenuRow({ id: 'dsh-mnemon', label: '记忆系统', visible: true }, actions)
  assert.equal(closed, false)
  assert.deepEqual(actions.calls, [['setHidden', 'dsh-mnemon', true]])
})

test('点已收起的入口：恢复它并打开，菜单关闭', async () => {
  const { activateMenuRow } = await api()
  const actions = recorder()
  const closed = activateMenuRow({ id: 'dsh-mnemon', label: '记忆系统', visible: false }, actions)
  assert.equal(closed, true)
  assert.deepEqual(actions.calls, [
    ['setHidden', 'dsh-mnemon', false],
    ['open', 'dsh-mnemon'],
  ])
})

test('行数据不合法时不抛错，也不做任何事', async () => {
  const { activateMenuRow } = await api()
  const actions = recorder()
  assert.equal(activateMenuRow(undefined, actions), false)
  assert.equal(activateMenuRow({ label: '没有 id' }, actions), false)
  assert.deepEqual(actions.calls, [])
})
