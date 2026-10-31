/**
 * dsh-sidebar-optimizer — 浏览器半身。
 *
 * 只做左侧栏「全局面板」入口区的两件事：
 *   ① 把不需要的入口从导航区收起（仍可从「更多」菜单打开）；
 *   ② 把整块入口区折叠成一条细条，把高度让给下面的工作区/会话列表。
 *
 * 不接管核心渲染：不替换任何官方组件，只注册官方 slot 并给自己的
 * CSS 节点打属性。任何一步失败都静默退回官方外观，不影响使用。
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-optimizer',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')

    /** localStorage 键；带版本号，将来改结构时可以另起一个键。 */
    const STORAGE_KEY = 'dsh-sidebar-optimizer:v1'
    /** 官方始终显示的入口：它没有"更多"之外的归处，不允许被收起。 */
    const PROTECTED_IDS = ['plugins']
    const NO_HIDDEN = []

    const isProtected = (id) => PROTECTED_IDS.includes(id)

    /** 把任意输入收敛成内部状态：类型不对就逐项回退，绝不整体丢弃。 */
    function parseState(raw) {
      if (typeof raw !== 'string' || raw === '') return { collapsed: false, hidden: [] }
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { collapsed: false, hidden: [] }
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { collapsed: false, hidden: [] }
      }
      return {
        collapsed: parsed.collapsed === true,
        hidden: normalizeHidden(parsed.hidden),
      }
    }

    /** 收起列表的唯一合法形态：非空字符串、去重、不含受保护入口。 */
    function normalizeHidden(value) {
      if (!Array.isArray(value)) return []
      const out = []
      for (const item of value) {
        if (typeof item !== 'string') continue
        const id = item.trim()
        if (id === '' || isProtected(id) || out.includes(id)) continue
        out.push(id)
      }
      return out
    }

    function serializeState(state) {
      return JSON.stringify({
        collapsed: state.collapsed === true,
        hidden: normalizeHidden(state.hidden),
      })
    }

    /** 收起/恢复一个入口，返回新的收起列表。 */
    function toggleHidden(hidden, id, hide) {
      const list = normalizeHidden(hidden)
      if (isProtected(id)) return list
      const has = list.includes(id)
      if (hide === true) return has ? list : [...list, id]
      return has ? list.filter((entry) => entry !== id) : list
    }

    /** 该入口此刻是否应从导航区隐藏。 */
    function isHidden(id, hidden) {
      if (isProtected(id)) return false
      return Array.isArray(hidden) && hidden.includes(id)
    }

    /**
     * 导航区的每一行只带本地化 label、不带 id，所以用「更多」菜单拿到的
     * entries（id + label）建一张 label → id 的索引，键值均去空白。
     */
    function buildLabelIndex(entries) {
      const index = Object.create(null)
      if (!Array.isArray(entries)) return index
      for (const entry of entries) {
        const row = validEntry(entry)
        if (row === undefined) continue
        if (Object.prototype.hasOwnProperty.call(index, row.label)) continue
        index[row.label] = row.id
      }
      return index
    }

    /** 把收起状态映射成「每一行是否隐藏」的计划，顺序与 entries 一致。 */
    function visibilityPlan(entries, hidden) {
      if (!Array.isArray(entries)) return []
      const plan = []
      for (const entry of entries) {
        const row = validEntry(entry)
        if (row === undefined) continue
        plan.push({ id: row.id, label: row.label, hidden: isHidden(row.id, hidden) })
      }
      return plan
    }

    /** 只接受 id / label 都非空的 entry，其余一律忽略。 */
    function validEntry(entry) {
      if (entry === null || typeof entry !== 'object') return undefined
      const { id, label } = entry
      if (typeof id !== 'string' || id === '') return undefined
      if (typeof label !== 'string') return undefined
      const trimmed = label.trim()
      if (trimmed === '') return undefined
      return { id, label: trimmed }
    }

    //#region DOM 应用层
    /** 插件打在导航区上的标记；注入的 CSS 与测试都依赖这些名字。 */
    const COLLAPSED_ATTR = 'data-sbo-collapsed'
    const HIDDEN_ATTR = 'data-sbo-hidden'
    const BAR_ATTR = 'data-sbo-bar'
    const BAR_LABEL = '全局面板'
    /** @zerorigin-studio/dsh-deepseek-chat 建在「新会话」下方的网页对话入口。 */
    const CHAT_ENTRY_ID = 'dsh-chat-entry'

    /**
     * 把状态打到导航区上：被收起的行打隐藏标记、整块折叠、保证折叠条存在，
     * 并把外来的网页对话入口收进面板区。
     * 幂等——React 每次重渲染后重复调用都安全。
     */
    function applySidebarState(nav, options) {
      if (nav === null || nav === undefined || typeof nav.querySelectorAll !== 'function') return
      const { plan, collapsed, onToggle, chatEntry } = options ?? {}
      const hiddenLabels = new Set()
      for (const row of Array.isArray(plan) ? plan : []) {
        if (row === null || typeof row !== 'object' || row.hidden !== true) continue
        if (typeof row.label === 'string') hiddenLabels.add(row.label)
      }
      for (const button of Array.from(nav.querySelectorAll('button'))) {
        const label = (button.getAttribute('aria-label') ?? '').trim()
        if (hiddenLabels.has(label)) button.setAttribute(HIDDEN_ATTR, 'true')
        else button.removeAttribute(HIDDEN_ATTR)
      }
      if (collapsed === true) nav.setAttribute(COLLAPSED_ATTR, 'true')
      else nav.removeAttribute(COLLAPSED_ATTR)
      ensureBar(nav, collapsed === true, onToggle)
      adoptChatEntry(nav, chatEntry)
    }

    /**
     * 把网页对话入口搬进面板区：它随面板区一起折叠，展开时排在面板行之前。
     * 只搬"仍在文档里"的节点——对方插件关掉这个入口时节点已不在文档中，
     * 这里保持中立，不会把它插回来。
     */
    function adoptChatEntry(nav, host) {
      if (nav === null || nav === undefined || typeof nav.insertBefore !== 'function') return false
      if (host === null || host === undefined || typeof host !== 'object') return false
      if (host.parentNode === nav) return false
      nav.insertBefore(host, nav.firstElementChild ?? null)
      return true
    }

    /** 折叠条是导航区的前一个兄弟节点：不存在就建，存在就更新文案与回调。 */
    function ensureBar(nav, collapsed, onToggle) {
      const doc = nav.ownerDocument
      if (doc === null || doc === undefined || typeof doc.createElement !== 'function') return
      let bar = nav.previousElementSibling
      if (bar === null || bar === undefined || bar.getAttribute(BAR_ATTR) !== 'true') {
        if (nav.parentNode === null || nav.parentNode === undefined) return
        bar = doc.createElement('button')
        bar.setAttribute('type', 'button')
        bar.setAttribute(BAR_ATTR, 'true')
        nav.parentNode.insertBefore(bar, nav)
      }
      bar.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      bar.setAttribute('aria-label', collapsed ? `展开${BAR_LABEL}` : `收起${BAR_LABEL}`)
      const text = (collapsed ? '▸ ' : '▾ ') + BAR_LABEL
      // 只在真正变化时写：写 textContent 会替换文本节点，进而触发我们自己的
      // 变更观察器；无条件写会让「观察 → 应用 → 再观察」自激成死循环。
      if (bar.textContent !== text) bar.textContent = text
      bar.onclick = () => {
        if (typeof onToggle === 'function') onToggle(collapsed !== true)
      }
    }
    //#endregion

    /** 「更多」菜单里的管理行：显示中的入口可收起，被收起的入口可恢复并打开。 */
    function manageRows(entries, hidden) {
      if (!Array.isArray(entries)) return []
      const rows = []
      for (const entry of entries) {
        const row = validEntry(entry)
        if (row === undefined || isProtected(row.id)) continue
        rows.push({ id: row.id, label: row.label, visible: !isHidden(row.id, hidden) })
      }
      return rows
    }

    /**
     * 菜单里点一行的语义：显示中的入口收起（菜单留在原地，方便连着整理几个）；
     * 已收起的入口恢复并打开（入口不会因为被收起而失去去处）。
     * 返回是否应当关闭菜单。
     */
    function activateMenuRow(row, actions) {
      if (row === null || row === undefined || typeof row.id !== 'string' || row.id === '') return false
      if (typeof actions?.setHidden !== 'function') return false
      if (row.visible === true) {
        actions.setHidden(row.id, true)
        return false
      }
      actions.setHidden(row.id, false)
      if (typeof actions.open === 'function') actions.open(row.id)
      return true
    }

    /** 惰性取用 localStorage：插件被卸载重载、或存储被禁用时都不会抛。 */
    function getStorage() {
      try {
        return window.localStorage
      } catch {
        return undefined
      }
    }

    function readState() {
      const storage = getStorage()
      if (storage === undefined) return { collapsed: false, hidden: [] }
      try {
        return parseState(storage.getItem(STORAGE_KEY))
      } catch {
        return { collapsed: false, hidden: [] }
      }
    }

    function writeState(state) {
      const storage = getStorage()
      if (storage === undefined) return
      try {
        storage.setItem(STORAGE_KEY, serializeState(state))
      } catch {
        /* 隐私模式或配额满：保持内存状态即可。 */
      }
    }

    /**
     * 折叠态与收起列表的唯一来源：写回 localStorage 后通知所有订阅者
     * （折叠条、菜单行、DOM 应用层都盯着它）。
     */
    function createStore() {
      let state = readState()
      const listeners = new Set()
      const commit = (next) => {
        state = next
        writeState(state)
        for (const listener of Array.from(listeners)) {
          try {
            listener(state)
          } catch {
            /* 单个订阅者出错不影响其余订阅者与页面。 */
          }
        }
      }
      return {
        get: () => state,
        setCollapsed: (collapsed) => commit({ collapsed: collapsed === true, hidden: state.hidden }),
        setHidden: (id, hide) => commit({ collapsed: state.collapsed, hidden: toggleHidden(state.hidden, id, hide) }),
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    //#region apply
    const inject = ['slots', 'locale']

    /** 导航区、折叠条与菜单行的样式；只用自己的标记选择器，不动官方类名。 */
    const CSS = [
      '[data-sbo-collapsed="true"]{display:none !important}',
      '[data-sbo-hidden="true"]{display:none !important}',
      '[data-sbo-bar]{display:flex;align-items:center;gap:6px;width:100%;margin:2px 0;padding:3px 8px;',
      'border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary,#8a8a8a);font-size:12px;line-height:16px;text-align:left;',
      'transition:background-color .12s ease,color .12s ease}',
      '[data-sbo-bar]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));',
      'color:var(--dsw-alias-label-primary,inherit)}',
      '.sbo-menu-title{padding:6px 10px 2px;color:var(--dsw-alias-label-secondary,#8a8a8a);font-size:12px;line-height:16px}',
      '.sbo-fallback-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;',
      'background:transparent;cursor:pointer;color:inherit;font-size:14px;text-align:left}',
      '.sbo-fallback-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      // 网页对话入口：收成与面板行同级的小行。它的尺寸由对方插件的内联样式给出，
      // 因此这里用 !important 覆盖；背景与悬停色保持对方设置，动画不受影响。
      '#dsh-chat-entry{margin:0 0 2px !important}',
      '#dsh-chat-entry>a{height:28px !important;padding:0 8px !important;gap:4px !important;',
      'border-radius:var(--dsw-radius-sm,6px) !important;font-size:12px !important;line-height:18px !important}',
      '#dsh-chat-entry svg{width:14px !important;height:14px !important}',
    ].join('')

    const CSS_TAG_ID = 'dsh-sidebar-optimizer/sidebar.css'
    const NAV_SELECTOR = '[class*="_panelList"]'

    /** 注入自己的样式表：重复挂载时按标签去重，卸载时随宿主一并消失。 */
    function installCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-sidebar-optimizer'
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = CSS
      const host = document.head ?? document.documentElement
      host?.appendChild(tag)
    }

    /** 让 label 既能吃字符串，也能吃官方 locale-aware 结构。 */
    function createLabelResolver(slotsModule) {
      return (label, fallbackId) => {
        if (typeof label === 'string' && label.trim() !== '') return label.trim()
        try {
          const resolved = slotsModule?.resolveSlotLabel?.(label)
          if (typeof resolved === 'string' && resolved.trim() !== '') return resolved.trim()
        } catch {
          /* 落到 fallbackId */
        }
        return typeof fallbackId === 'string' && fallbackId !== '' ? fallbackId : undefined
      }
    }

    /** 「更多」菜单里的管理行组件：收起不关菜单，恢复时顺带打开该面板。 */
    function createMenuComponent(store, primitives) {
      const { jsx, jsxs, Fragment } = require('react/jsx-runtime')
      const MenuItemButton =
        primitives?.MenuItemButton ??
        ((props) =>
          jsx('button', {
            type: 'button',
            className: 'sbo-fallback-item',
            onClick: props.onSelect,
            children: props.children,
          }))
      const CheckIcon = primitives?.IconCheckOutlineRegular
      const CollapseIcon = primitives?.IconCollapseOutlineRegular

      return function SidebarOptimizerMenu(props) {
        const { entries, onOpen, onDismiss } = props ?? {}
        const [state, setState] = react.useState(store.get())
        react.useEffect(() => store.subscribe(setState), [])
        let rows
        try {
          rows = manageRows(entries, state.hidden)
        } catch {
          return null
        }
        if (rows.length === 0) return null
        const items = [
          jsx('div', { key: 'sbo-title', className: 'sbo-menu-title', children: '侧栏入口' }, 'sbo-title'),
          jsx(
            MenuItemButton,
            {
              key: 'sbo-collapse',
              onSelect: () => {
                store.setCollapsed(!state.collapsed)
                if (typeof onDismiss === 'function') onDismiss()
              },
              children: state.collapsed ? '展开入口区' : '收起入口区',
            },
            'sbo-collapse',
          ),
        ]
        for (const row of rows) {
          items.push(
            jsx(
              MenuItemButton,
              {
                key: row.id,
                current: row.visible,
                icon: row.visible && CheckIcon !== undefined ? jsx(CheckIcon, { size: 16 }) : undefined,
                onSelect: () => {
                  const shouldClose = activateMenuRow(row, {
                    setHidden: (id, hide) => store.setHidden(id, hide),
                    open: (id) => {
                      if (typeof onOpen === 'function') onOpen(id)
                    },
                  })
                  if (shouldClose && typeof onDismiss === 'function') onDismiss()
                },
                children: row.label,
              },
              row.id,
            ),
          )
        }
        void CollapseIcon
        void jsxs
        void Fragment
        return jsx(Fragment, { children: items })
      }
    }

    /**
     * 插件入口：注册官方「更多」菜单行，并给导航区挂上折叠与收纳。
     * 每一步都独立兜底——任何一环失败都只是少一个增强，不影响侧栏本身。
     */
    function apply(ctx) {
      const store = createStore()
      const slotsModule = (() => {
        try {
          return require('@deepseek-ai/dsh-client-ui-slots')
        } catch {
          return undefined
        }
      })()
      const resolveLabel = createLabelResolver(slotsModule)
      const primitives = (() => {
        try {
          return require('@deepseek-ai/dsh-client-ui-primitives')
        } catch {
          return undefined
        }
      })()

      try {
        ctx.slots.inject('sidebar.panellist.actions', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist.actions',
              id: 'sidebar-optimizer',
              inject: () => ({}),
            },
            createMenuComponent(store, primitives),
          ),
        )
      } catch (error) {
        if (typeof console !== 'undefined') console.warn('[sidebar-optimizer] 菜单行注册失败：', error)
      }

      try {
        installCss()
      } catch (error) {
        if (typeof console !== 'undefined') console.warn('[sidebar-optimizer] 样式注入失败：', error)
      }

      let entries = []
      let scheduled = false

      const readPanels = () => {
        const list = ctx.slots?.entriesOfSlot?.('sidebar.panellist') ?? []
        return list.map(({ options }) => ({
          id: options?.id,
          label: resolveLabel(options?.label, options?.id),
        }))
      }

      const applyNow = () => {
        try {
          if (typeof document === 'undefined') return
          const nav = document.querySelector(NAV_SELECTOR)
          if (nav === null || nav === undefined) return
          const state = store.get()
          applySidebarState(nav, {
            plan: visibilityPlan(entries, state.hidden),
            collapsed: state.collapsed,
            onToggle: (next) => store.setCollapsed(next),
            chatEntry: document.getElementById(CHAT_ENTRY_ID),
          })
        } catch (error) {
          if (typeof console !== 'undefined') console.warn('[sidebar-optimizer] 应用失败：', error)
        }
      }

      const schedule = () => {
        if (scheduled) return
        scheduled = true
        const run = () => {
          scheduled = false
          applyNow()
        }
        try {
          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(run)
            return
          }
        } catch {
          /* 落到 setTimeout */
        }
        setTimeout(run, 16)
      }

      store.subscribe(schedule)

      ctx.effect(() => {
        if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return () => {}
        const observer = new MutationObserver(schedule)
        observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
        return () => observer.disconnect()
      }, 'sidebar-optimizer: 跟随侧栏重渲染')

      ctx.effect(() => {
        const sync = () => {
          entries = readPanels()
          schedule()
        }
        sync()
        const offSlots = ctx.slots?.subscribe?.('sidebar.panellist', sync)
        const offLocale = ctx.locale?.subscribe?.(sync)
        return () => {
          if (typeof offSlots === 'function') offSlots()
          if (typeof offLocale === 'function') offLocale()
        }
      }, 'sidebar-optimizer: 入口列表')

      schedule()
    }
    //#endregion

    exports.apply = apply
    exports.inject = inject
    exports.__internals = {
      STORAGE_KEY,
      PROTECTED_IDS,
      NO_HIDDEN,
      parseState,
      serializeState,
      toggleHidden,
      isHidden,
      normalizeHidden,
      buildLabelIndex,
      visibilityPlan,
      manageRows,
      activateMenuRow,
      createStore,
      applySidebarState,
      ensureBar,
      adoptChatEntry,
      COLLAPSED_ATTR,
      HIDDEN_ATTR,
      BAR_ATTR,
      BAR_LABEL,
      CHAT_ENTRY_ID,
      readState,
      writeState,
    }
    return module.exports
  },
})
