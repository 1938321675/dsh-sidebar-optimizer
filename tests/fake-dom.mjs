/**
 * 测试用最小 DOM 替身：只实现插件真正用到的那部分浏览器接口。
 * 生产代码通过 nav.ownerDocument 拿 document，因此这里造的元素能被直接喂进去。
 */
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase()
    this.ownerDocument = ownerDocument
    this.attributes = new Map()
    this.childNodes = []
    this.parentNode = null
    this.onclick = null
    this.dataset = {}
    // 真实浏览器里每次写 textContent 都会替换文本节点，从而触发子节点变更；
    // 这里记下写入次数，用来钉住"重复应用不产生新的 DOM 变更"。
    this.textWrites = 0
    let text = ''
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (next) => {
        this.textWrites += 1
        text = String(next)
      },
    })
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  appendChild(child) {
    return this.insertBefore(child, null)
  }

  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child)
    const at = reference ? this.childNodes.indexOf(reference) : -1
    if (at >= 0) this.childNodes.splice(at, 0, child)
    else this.childNodes.push(child)
    child.parentNode = this
    return child
  }

  removeChild(child) {
    const at = this.childNodes.indexOf(child)
    if (at >= 0) this.childNodes.splice(at, 1)
    child.parentNode = null
    return child
  }

  /** nav.before(bar) 的等价物；不支持时由调用方回退到 insertBefore。 */
  before(node) {
    if (!this.parentNode) return
    this.parentNode.insertBefore(node, this)
  }

  get children() {
    return this.childNodes.slice()
  }

  get previousElementSibling() {
    if (!this.parentNode) return null
    const at = this.parentNode.childNodes.indexOf(this)
    return at > 0 ? this.parentNode.childNodes[at - 1] : null
  }

  get firstElementChild() {
    return this.childNodes[0] ?? null
  }

  querySelectorAll(selector) {
    const out = []
    const matches = (node) => {
      if (selector === node.tagName.toLowerCase()) return true
      const attr = /^\[([a-zA-Z0-9-]+)(?:([*^$]?=)"?([^"\]]*)"?)?\]$/.exec(selector)
      if (attr === null) return false
      const [, name, , value] = attr
      const actual = node.getAttribute(name)
      if (actual === null) return false
      return value === undefined ? true : actual.includes(value)
    }
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (matches(child)) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }

  click() {
    if (typeof this.onclick === 'function') this.onclick({ type: 'click', target: this })
  }
}

export function createDocument() {
  const doc = {
    head: null,
    body: null,
    createElement(tag) {
      return new FakeElement(tag, doc)
    },
    querySelector(selector) {
      return doc.documentElement.querySelectorAll(selector)[0] ?? null
    },
    querySelectorAll(selector) {
      return doc.documentElement.querySelectorAll(selector)
    },
    getElementById(id) {
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.getAttribute('id') === id) return child
          const hit = walk(child)
          if (hit !== null) return hit
        }
        return null
      }
      return walk(doc.documentElement)
    },
  }
  doc.head = new FakeElement('head', doc)
  doc.body = new FakeElement('body', doc)
  doc.documentElement = new FakeElement('html', doc)
  doc.documentElement.appendChild(doc.head)
  doc.documentElement.appendChild(doc.body)
  return doc
}

/** 造一个导航区：nav 里每行是一个带 aria-label 的 button。 */
export function createNav(doc, labels) {
  const nav = doc.createElement('nav')
  // 真实侧栏的类名带 CSS Module 哈希前缀，插件按 [class*="_panelList"] 匹配。
  nav.setAttribute('class', 'wtg9ga_panelList')
  for (const label of labels) {
    const row = doc.createElement('button')
    row.setAttribute('aria-label', label)
    nav.appendChild(row)
  }
  doc.body.appendChild(nav)
  return nav
}
