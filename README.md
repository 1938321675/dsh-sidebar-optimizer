# dsh-sidebar-optimizer

DSH 左侧栏「全局面板」入口区的优化插件：把入口区整块折叠成一条细条，并支持把单个入口从导航区收起，让出的高度全部归下面的工作区与会话列表。

## 安装

需要 DSH Desktop（或带 Web 客户端的 DSH），Node 22.19+ / 24+。

```bash
dsh plugin add github:1938321675/dsh-sidebar-optimizer
```

安装后重启 DSH 桌面端，或刷新一次 Web 界面。

更新到最新版本：

```bash
dsh plugin add github:1938321675/dsh-sidebar-optimizer
```

卸载：

```bash
dsh plugin remove dsh-sidebar-optimizer
```

也可以指向本地目录开发调试：`dsh plugin add file:<包目录绝对路径>`。

## 它做什么

- **折叠整块**：导航区上方出现一条 `▾ 全局面板` 细条。点一下整块入口收起，工作区占满剩余高度；再点一下展开。
- **逐个收纳**：打开侧栏的「更多」菜单，菜单里多出「侧栏入口」一段，列出除「插件」外的每个入口：
  - 点显示中的入口：收起它（菜单留在原地，方便连着整理几个）
  - 点已收起的入口：恢复它并打开
  - 被收起的入口仍留在「更多」菜单里，随时可以恢复
- 「更多」菜单里另有「收起入口区 / 展开入口区」一行，与细条等效。
- 折叠状态与收起列表存在 `localStorage["dsh-sidebar-optimizer:v1"]`，刷新页面后保持。

## 网页对话入口

`@zerorigin-studio/dsh-deepseek-chat` 把它的入口建成固定 id 的 DOM 节点（`#dsh-chat-entry`），挂在「新会话」按钮下方。本插件在每次应用状态时把这个节点搬进「全局面板」区域，于是它随入口区一起折叠；同时用 `#dsh-chat-entry` 的样式规则把它收成与面板行同级的小行（28px 高、12px 字号）。它的悬停底色、点击行为、以及对方插件在设置里提供的开关都照常工作。

侧栏收成 56px 轨道时，入口区整体隐藏，这个入口随之隐藏，展开侧栏后可见。对方插件关掉这个入口时节点已从文档移除，本插件不做搬迁。

## 文件结构

| 文件 | 作用 |
| --- | --- |
| `lib/client.js` | 浏览器半身：折叠条、入口收纳、官方「更多」菜单行、网页对话入口搬迁 |
| `lib/index.js` | 宿主半身，无逻辑，只为让包可被 profile 加载 |
| `cordis.patch.yml` | 包自带的挂载补丁 |
| `tests/` | 51 项测试，命令 `npm test`（等价于 `node --test tests/*.test.mjs`） |

## 启停

挂载点是 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾的 `sidebar-optimizer` insert 条目。停用时在该文件里加入：

```yaml
- id: sidebar-optimizer
  disabled: true
```

依赖声明在 `~/.dsh/profiles/desktop/package.json` 的 `"dsh-sidebar-optimizer": "link:../../sidebar-optimizer"`。

## 实现边界

插件通过官方 `sidebar.panellist.actions` 席位注册菜单行，并给自建节点打属性、注入自有的 `<style data-plugin-css>`。官方组件的渲染与行为保持原样；元素匹配用 `[class*="_panelList"]`，与界面语言和皮肤无关。每一步各自 try/catch，任一步失败只少一项增强，侧栏呈现官方外观。
