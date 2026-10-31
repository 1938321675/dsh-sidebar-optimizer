/**
 * 侧栏优化插件——接线层测试。
 *
 * 证明插件真的挂上了官方「更多」菜单，并且启动时就把保存的折叠态与
 * 收起列表应用到导航区（不是等用户点一次菜单才生效）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadClient, makeStorage } from './harness.mjs'
import { createDocument, createNav } from './fake-dom.mjs'

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js')

/** 最小 ctx：注册、入口列表与 effect 都记录下来，供断言检查。 */
function createCtx({ panels = [] } = {}) {
  const registered = []
  return {
    registered,
    slots: {
      inject: (name, callback) => {
        assert.equal(name, 'sidebar.panellist.actions')
        callback()
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
      entriesOfSlot: (name) =>
        name === 'sidebar.panellist' ? panels.map((panel) => ({ options: { id: panel.id, label: panel.label } })) : [],
      subscribe: () => () => {},
    },
    locale: { subscribe: () => () => {} },
    effect: (callback) => {
      const off = callback()
      return typeof off === 'function' ? off : () => {}
    },
  }
}

async function boot({ panels = [], storage = makeStorage(), labels = [], withChatEntry = false } = {}) {
  const doc = createDocument()
  globalThis.document = doc
  let chatEntry = null
  if (withChatEntry) {
    // 模拟 dsh-deepseek-chat 的行为：把自己的入口插在「新会话」下方（导航区之外）。
    chatEntry = doc.createElement('div')
    chatEntry.setAttribute('id', 'dsh-chat-entry')
    doc.body.appendChild(chatEntry)
  }
  const nav = labels.length > 0 ? createNav(doc, labels) : null
  const { exports } = await loadClient(CLIENT, storage)
  globalThis.window.requestAnimationFrame = (callback) => {
    callback()
    return 0
  }
  const ctx = createCtx({ panels })
  exports.apply(ctx)
  return { doc, nav, chatEntry, ctx, exports }
}

test('apply 把管理行注册进官方「更多」菜单', async () => {
  const { ctx, exports } = await boot()
  assert.equal(ctx.registered.length, 1)
  assert.equal(ctx.registered[0].options.name, 'sidebar.panellist.actions')
  assert.equal(ctx.registered[0].options.id, 'sidebar-optimizer')
  assert.equal(typeof ctx.registered[0].component, 'function')
  assert.deepEqual(exports.inject, ['slots', 'locale'])
})

test('apply 之后导航区前面出现折叠条', async () => {
  const { nav, exports } = await boot({ labels: ['插件', '记忆系统', '更多'] })
  const { BAR_ATTR } = exports.__internals
  assert.equal(nav.previousElementSibling.getAttribute(BAR_ATTR), 'true')
})

test('apply 会把保存的折叠态直接应用到导航区', async () => {
  const storage = makeStorage({
    'dsh-sidebar-optimizer:v1': JSON.stringify({ collapsed: true, hidden: [] }),
  })
  const { nav, exports } = await boot({ labels: ['插件', '记忆系统', '更多'], storage })
  assert.equal(nav.getAttribute(exports.__internals.COLLAPSED_ATTR), 'true')
})

test('apply 会把保存的收起列表应用到对应入口行', async () => {
  const storage = makeStorage({
    'dsh-sidebar-optimizer:v1': JSON.stringify({ collapsed: false, hidden: ['dsh-mnemon'] }),
  })
  const { nav, exports } = await boot({
    panels: [
      { id: 'plugins', label: '插件' },
      { id: 'dsh-mnemon', label: '记忆系统' },
    ],
    labels: ['插件', '记忆系统', '更多'],
    storage,
  })
  const { HIDDEN_ATTR } = exports.__internals
  const row = (label) => nav.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label)
  assert.equal(row('记忆系统').getAttribute(HIDDEN_ATTR), 'true')
  assert.equal(row('插件').hasAttribute(HIDDEN_ATTR), false)
})

test('apply 会把外来的「网页对话」入口搬进全局面板区', async () => {
  const { nav, chatEntry } = await boot({ labels: ['插件', '记忆系统', '更多'], withChatEntry: true })
  assert.equal(chatEntry.parentNode, nav)
  assert.equal(nav.firstElementChild, chatEntry)
})

test('apply 在没有导航区、没有入口时也不抛错', async () => {
  await assert.doesNotReject(async () => {
    await boot({ panels: [], labels: [] })
  })
})
