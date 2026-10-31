/**
 * 测试脚手架：把 client.js 当成浏览器脚本加载。
 *
 * client.js 是自包含的 DSH 客户端模块（调用 window.__ModuleLoader__.load）。
 * 这里伪造最小的 window 与 require，捕获 factory 的返回值，
 * 于是 Node 里测到的是**真实的生产文件**，不是复制品。
 */
import { pathToFileURL } from 'node:url'

export function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map),
  }
}

function fakeRequire(id) {
  if (id === 'react') {
    return {
      useState: () => [undefined, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: undefined }),
      createElement: () => null,
      Fragment: Symbol('Fragment'),
    }
  }
  if (id === 'react/jsx-runtime') {
    return { jsx: () => null, jsxs: () => null, Fragment: Symbol('Fragment') }
  }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') {
    return new Proxy({}, { get: () => () => null })
  }
  if (id === '@deepseek-ai/dsh-client-ui-slots') {
    return { resolveSlotLabel: (label) => (typeof label === 'string' ? label : undefined) }
  }
  throw new Error('测试脚手架未声明的 require: ' + id)
}

/** 加载 lib/client.js，返回它的 exports 与它写过的 localStorage 内容。 */
export async function loadClient(clientPath, storage = makeStorage()) {
  let captured
  // 测试进程里就让 window 一直可用：插件在浏览器中运行时 window 始终存在，
  // 测试结束后每个用例各自重新加载，互不影响。
  globalThis.window = {
    __ModuleLoader__: { load: (def) => { captured = def } },
    localStorage: storage,
  }
  await import(pathToFileURL(clientPath).href + '?t=' + Date.now() + Math.random())
  if (!captured) throw new Error('client.js 没有调用 window.__ModuleLoader__.load')
  const exports = captured.factory(fakeRequire)
  return { exports, storage, id: captured.id }
}
