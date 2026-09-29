// dsh-chameleon session-delete: CLIENT half.
//
// One shared delete dialog for every entry point:
//   - header danger button  (conversation.session.header.actions, order 30)
//   - sidebar session-row "..." menu item
//     (sidebar.workspaces.session.menu.item, order 500)
// The dialog is a root-scoped shell.overlay occupant that listens for a
// window 'chameleon:delete-session' event carrying {sessionId, title,
// running}; both entry points dispatch it, so the sidebar item NEVER
// switches the conversation. The dialog shows the session name + id and a
// running warning; deleting a running session stops it on the host first
// (agent.cancel + quiescence) — the delete itself is always allowed.
//
// DSH 0.2.x adaptation: ui-workspace now declares the row menu as a real slot
// (0.1.x had none, so this half used a MutationObserver over [class*=sessionRow]
// menus). The slot hands every entry the row's {sessionId, displayTitle} plus a
// `useMenuOpenState` hook, so the sidebar item resolves its target by id
// instead of by title matching and no DOM scraping remains.
//
// Locale: all copy lives in the zh/en dictionaries below and follows the
// client's active language through the `locale` service (the `t` seat on both
// registered components, `useLocaleRevision()` to re-render when the locale
// service arrives late). Without the service, a browser-language sniff
// selects the dictionary.
//
// Bundle format (client-modules protocol): classic script registering a
// factory via window.__ModuleLoader__.load({ id, factory }); the factory
// receives `require` and returns the plugin's exports (apply etc.).
// No JSX: plain React.createElement. Theme tokens only (--dsw-*).
window.__ModuleLoader__.load({
  id: '@huanlin/dsh-plugin-session-delete',
  factory: (require) => {
    const React = require('react')
    const { useCallback, useEffect, useState } = React
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const { MenuItemButton, Modal } = primitives
    // DSH 0.2.x renamed the icon set: the 16-suffixed names were replaced by
    // Regular/Medium stroke variants (IconTrashOutline16 -> IconTrashOutlineRegular).
    // Resolve lazily with a fallback chain so the bundle keeps rendering on either
    // generation instead of throwing on an undefined component.
    const TrashIcon = primitives.IconTrashOutlineRegular
      || primitives.IconTrashOutlineMedium
      || primitives.IconTrashOutline16

    const SLOT = 'conversation.session.header.actions'
    const ROW_ID = 'session-delete'
    const SIDEBAR_MENU_SLOT = 'sidebar.workspaces.session.menu.item'
    const SIDEBAR_MENU_ID = 'session-delete:sidebar-menu-item'
    // ui-workspace ships pin(100)/rename(200)/fork(300)/archive(400); 500 keeps
    // the delete row last, below the shipped group.
    const SIDEBAR_MENU_ORDER = 500
    const OVERLAY_SLOT = 'shell.overlay'
    const DIALOG_ID = 'session-delete-dialog'
    const EVENT = 'chameleon:delete-session'

    // --- locale -----------------------------------------------------------------
    // The copy follows the client's active language (zh/en). Dictionaries are
    // registered under our namespace with the `locale` service when it exists;
    // slot entries declare `locale: NS` so the renderer injects the `t` seat
    // (live re-render on switches). Without the service (minimal compositions)
    // a browser-language sniff keeps the English adaptation working.

    const NS = 'session-delete'

    const zhDict = {
      'dialog.title': '删除会话',
      'dialog.cancel': '取消',
      'dialog.confirm': '删除',
      'dialog.confirming': '删除中…',
      'dialog.deleting': '正在删除…',
      'dialog.untitled': '未命名会话',
      'dialog.session': '会话：',
      'dialog.sessionId': '序列号：',
      'dialog.runningWarn': '⚠ 会话正在运行',
      'dialog.ack': '我已了解后果，确认删除',
      'dialog.notFoundDesc': '未能在会话列表中找到该会话（可能已被删除或列表尚未刷新），请刷新后重试。',
      'dialog.runningDesc': '该会话正在运行，删除会立即停止其任务并永久删除，正在进行的操作将中断且无法恢复。',
      'dialog.deleteDesc': '将永久删除该会话及其全部对话记录（会话日志、统计与工作区记账），此操作不可恢复。',
      'button.title': '删除会话',
      'button.titleRunning': '删除会话（运行中，删除将停止任务）',
      'menu.delete': '删除会话',
    }

    const enDict = {
      'dialog.title': 'Delete session',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Delete',
      'dialog.confirming': 'Deleting…',
      'dialog.deleting': 'Deleting…',
      'dialog.untitled': 'Untitled session',
      'dialog.session': 'Session: ',
      'dialog.sessionId': 'Session ID: ',
      'dialog.runningWarn': '⚠ Session is running',
      'dialog.ack': 'I understand the consequences. Confirm deletion',
      'dialog.notFoundDesc': 'Could not find this session in the session list (it may have been deleted or the list has not refreshed yet). Please refresh and try again.',
      'dialog.runningDesc': 'This session is running. Deleting it will stop its task immediately and remove it permanently; any work in progress will be interrupted and cannot be recovered.',
      'dialog.deleteDesc': 'This will permanently delete the session and all of its conversation records (session log, statistics and workspace accounting). This action cannot be undone.',
      'button.title': 'Delete session',
      'button.titleRunning': 'Delete session (running — deleting will stop the task)',
      'menu.delete': 'Delete session',
    }

    const btnStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      padding: 0,
      border: 'none',
      borderRadius: 6,
      background: 'transparent',
      color: 'var(--dsw-alias-label-tertiary, #8a8a8e)',
      cursor: 'pointer',
      flex: 'none',
    }

    const metaStyle = {
      color: 'var(--dsw-alias-label-secondary, #8a8a8e)',
      fontSize: 13,
      lineHeight: '20px',
      margin: '0 0 10px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }

    const warnStyle = {
      color: 'var(--dsw-alias-state-warn-primary, #f5a524)',
      fontSize: 13,
      lineHeight: '20px',
      margin: '0 0 10px',
    }

    const errStyle = {
      color: 'var(--dsw-alias-state-error-primary, #e5484d)',
      fontSize: 12,
      lineHeight: '16px',
      marginTop: 8,
    }

    const statusStyle = {
      color: 'var(--dsw-alias-label-secondary, #8a8a8e)',
      fontSize: 12,
      lineHeight: '16px',
      marginTop: 8,
    }

    const optStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      lineHeight: '20px',
      color: 'var(--dsw-alias-label-primary, inherit)',
      marginTop: 10,
    }

    const cancelBtnStyle = {
      padding: '6px 14px',
      borderRadius: 8,
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary, inherit)',
      fontSize: 13,
      cursor: 'pointer',
      marginRight: 8,
    }

    const dangerBtnStyle = {
      padding: '6px 14px',
      borderRadius: 8,
      border: '1px solid var(--dsw-alias-state-error-primary, #e5484d)',
      background: 'var(--dsw-alias-state-error-primary, #e5484d)',
      color: '#fff',
      fontSize: 13,
      cursor: 'pointer',
    }

    // --- shared delete dialog (root overlay) -----------------------------------

    // Module-level handle to the client sessions service: set in apply() and
    // refreshed by a deferred inject, so the dialog always reads the live
    // service even when it was not ready at plugin apply time.
    var __sessionsSvc = null

    // Module-level handle to the client locale service (LocaleRuntime): set in
    // apply() and refreshed by a deferred inject. `__t` resolves through the
    // service's lookup chain (ns -> ns.zh -> common -> key) when present, and
    // falls back to the built-in dicts selected by browser language otherwise.
    var __locale = null

    function localeFallbackLang() {
      if (typeof navigator === 'undefined') return 'zh'
      for (const tag of (navigator.languages || []).concat([navigator.language])) {
        const primary = String(tag || '').toLowerCase().split('-')[0]
        if (primary === 'zh' || primary === 'en') return primary
      }
      return 'zh'
    }

    function __t(key) {
      if (__locale && typeof __locale.translate === 'function') {
        const text = __locale.translate(NS, key)
        if (typeof text === 'string' && text !== key) return text
      }
      return (localeFallbackLang() === 'en' ? enDict : zhDict)[key] || key
    }

    // Re-render on locale snapshot changes, so copy follows the active
    // language even when an entry was registered without the `locale` seat
    // (e.g. the locale service arrived after slot registration).
    function useLocaleRevision() {
      const [, setRev] = useState(0)
      useEffect(() => {
        if (!__locale || typeof __locale.subscribe !== 'function') return undefined
        return __locale.subscribe(() => setRev((v) => v + 1))
      }, [])
    }

    function normalizeTitle(t) {
      return String(t || '').trim().replace(/\s+/g, ' ')
    }

    // '标题 (1)' -> '标题' (fork-session display suffix)
    function stripForkSuffix(t) {
      return normalizeTitle(t).replace(/\s*\(\d+\)\s*$/, '')
    }

    // Resolve the target session from the client's authoritative list store.
    // The sidebar dispatches by title only (its DOM carries no id); the
    // header dispatches by id. Matching levels: exact -> fork-suffix-stripped
    // -> contains. A failed store match falls back to the host list endpoint.
    function resolveTargetFromStore(detail) {
      let sessionId = detail.sessionId || null
      let title = detail.title || null
      let running = detail.running === true
      if (sessionId) return { sessionId, title, running }
      const want = normalizeTitle(title)
      if (!want) return null
      const wantBase = stripForkSuffix(want)
      const svc = __sessionsSvc
      if (svc && svc.list) {
        try {
          const snap = svc.list.getSnapshot()
          const byId = snap && snap.byId ? snap.byId : {}
          const ids = Object.keys(byId)
          for (const id of ids) {
            const s = byId[id]
            if (s && normalizeTitle(s.title) === want) {
              return { sessionId: id, title: s.title, running: s.running === true }
            }
          }
          if (wantBase) {
            for (const id of ids) {
              const s = byId[id]
              if (s && stripForkSuffix(s.title) === wantBase) {
                return { sessionId: id, title: s.title, running: s.running === true }
              }
            }
          }
          let best = null
          for (const id of ids) {
            const s = byId[id]
            if (!s || !s.title) continue
            const t = normalizeTitle(s.title)
            if (t && (t.indexOf(want) >= 0 || want.indexOf(t) >= 0)) {
              best = { sessionId: id, title: s.title, running: s.running === true }
            }
          }
          if (best) return best
        } catch { /* ignore */ }
      }
      return null
    }

    function DeleteSessionDialog(props) {
      const t = (props && props.t) || __t
      useLocaleRevision()
      const [target, setTarget] = useState(null) // {sessionId, title, running, notFound}
      const [acknowledged, setAcknowledged] = useState(false)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)

      useEffect(() => {
        const handler = (e) => {
          const d = e && e.detail ? e.detail : {}
          const resolved = resolveTargetFromStore(d)
          if (resolved) {
            setTarget(resolved)
            setAcknowledged(false)
            setError(null)
            setBusy(false)
            return
          }
          // Store miss: fall back to the host session list (projection
          // cache titles), and surface a not-found dialog if that fails too
          // so a click is never silent.
          const want = normalizeTitle(d.title)
          if (!want) return
          fetch('/__chameleon/session/list')
            .then(function (r) { return r.json() })
            .then(function (data) {
              let m = null
              if (data && data.ok && Array.isArray(data.sessions)) {
                const wantBase = stripForkSuffix(want)
                for (const s of data.sessions) {
                  if (!s.title) continue
                  const t = normalizeTitle(s.title)
                  if (t === want || (wantBase && stripForkSuffix(t) === wantBase) || t.indexOf(want) >= 0 || want.indexOf(t) >= 0) {
                    m = s
                    break
                  }
                }
              }
              if (m) {
                setTarget({ sessionId: m.sessionId, title: m.title, running: m.running === true })
              } else {
                setTarget({ sessionId: null, title: want, running: false, notFound: true })
              }
              setAcknowledged(false)
              setError(null)
              setBusy(false)
            })
            .catch(function () {
              setTarget({ sessionId: null, title: want, running: false, notFound: true })
              setAcknowledged(false)
              setError(null)
              setBusy(false)
            })
        }
        window.addEventListener(EVENT, handler)
        return () => window.removeEventListener(EVENT, handler)
      }, [])

      const close = useCallback(() => {
        if (busy) return
        setTarget(null)
        setError(null)
      }, [busy])

      const confirm = useCallback(() => {
        if (busy || !acknowledged || !target) return
        setBusy(true)
        setError(null)
        fetch('/__chameleon/session/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: target.sessionId }),
        })
          .then(async (res) => {
            let data = {}
            try { data = await res.json() } catch { /* keep {} */ }
            if (!res.ok || !data.ok) {
              throw new Error(data.error || `delete failed (HTTP ${res.status})`)
            }
            // Deleted. Refresh the sidebar list in place — NO page reload —
            // and if the current session was deleted, open the first
            // remaining session so the user can keep working.
            const svc = __sessionsSvc
            const deletedCurrent = svc && svc.list
              ? svc.list.getSnapshot().current === target.sessionId
              : false
            setTarget(null)
            if (svc && typeof svc.refreshList === 'function') {
              const done = svc.refreshList()
              if (deletedCurrent) {
                Promise.resolve(done).then(() => {
                  try {
                    const snap = svc.list.getSnapshot()
                    const next = (snap && snap.ids || []).find((id) => id !== target.sessionId)
                    if (next && typeof svc.open === 'function') svc.open(next)
                  } catch { /* ignore */ }
                })
              }
            }
          })
          .catch((reason) => {
            setBusy(false)
            setError(reason && reason.message ? reason.message : String(reason))
          })
      }, [busy, acknowledged, target])

      if (!target) return null

      const name = target.notFound ? target.title || t('dialog.untitled') : (target.title || t('dialog.untitled'))
      const description = target.notFound
        ? t('dialog.notFoundDesc')
        : target.running
          ? t('dialog.runningDesc')
          : t('dialog.deleteDesc')

      return React.createElement(Modal, {
        open: true,
        onClose: close,
        title: t('dialog.title'),
        closeLabel: t('dialog.cancel'),
        description,
        footer: [
          React.createElement('button', {
            key: 'cancel',
            type: 'button',
            disabled: busy,
            onClick: close,
            style: { ...cancelBtnStyle, ...(busy ? { opacity: 0.5, cursor: 'default' } : {}) },
          }, t('dialog.cancel')),
          React.createElement('button', {
            key: 'confirm',
            type: 'button',
            disabled: busy || !acknowledged || !target.sessionId,
            onClick: confirm,
            style: { ...dangerBtnStyle, ...(busy || !acknowledged || !target.sessionId ? { opacity: 0.5, cursor: 'default' } : {}) },
          }, busy ? t('dialog.confirming') : t('dialog.confirm')),
        ],
      }, [
        React.createElement('div', { key: 'meta', style: metaStyle },
          t('dialog.session'), name,
          target.sessionId
            ? React.createElement(React.Fragment, null,
                React.createElement('br'),
                t('dialog.sessionId'), target.sessionId)
            : null),
        target.running
          ? React.createElement('div', { key: 'warn', style: warnStyle }, t('dialog.runningWarn'))
          : null,
        React.createElement('label', { key: 'ack', style: optStyle },
          React.createElement('input', {
            type: 'checkbox',
            checked: acknowledged,
            disabled: busy,
            onChange: (e) => setAcknowledged(e.target.checked),
          }),
          t('dialog.ack')),
        busy ? React.createElement('div', { key: 'busy', style: statusStyle }, t('dialog.deleting')) : null,
        error ? React.createElement('div', { key: 'err', style: errStyle, role: 'alert' }, error) : null,
      ])
    }

    // --- header danger button ---------------------------------------------------

    function DeleteSessionButton(props) {
      const { sessionId, useSessions } = props
      const t = (props && props.t) || __t
      useLocaleRevision()
      const sessions = useSessions ? useSessions((s) => s) : undefined
      const summary = sessions && sessions.byId ? sessions.byId[sessionId] : undefined
      const running = summary ? summary.running === true : false

      const openDialog = useCallback(() => {
        window.dispatchEvent(new CustomEvent(EVENT, {
          detail: {
            sessionId,
            title: summary && summary.title ? summary.title : null,
            running,
          },
        }))
      }, [sessionId, summary, running])

      return React.createElement('button', {
        type: 'button',
        title: running ? t('button.titleRunning') : t('button.title'),
        'aria-label': t('button.title'),
        style: btnStyle,
        onClick: openDialog,
      }, React.createElement(TrashIcon, { size: 16 }))
    }

    // --- sidebar session-row "..." menu item -----------------------------------
    // DSH 0.2.x declares the session row's "..." menu as the
    // `sidebar.workspaces.session.menu.item` list slot (0.1.x had no extension
    // point, which is why this half used to scrape the DOM), so the delete row
    // is now an ordinary entry: the slot hands it the row's
    // {sessionId, displayTitle} plus the `useMenuOpenState` hook that dismisses
    // the menu. Order 500 keeps it below the shipped group
    // (pin 100 / rename 200 / fork 300 / archive 400), and the host's
    // MenuItemButton supplies the row styling and destructive colors.

    // One row of the sidebar session-row "..." menu. The slot gives the entry
    // the row's sessionId directly (no title matching, no host round-trip) and
    // the hook that closes the menu; the dialog then opens over the current
    // view without switching the conversation.
    function SidebarDeleteMenuItem(props) {
      const t = (props && props.t) || __t
      useLocaleRevision()
      const sessionId = props && props.sessionId ? props.sessionId : null
      const title = props && props.displayTitle ? props.displayTitle : null
      // Supplied by the slot's hookContext; absent when a composition declares
      // the slot without the menu-open hook.
      const useMenuOpenState = props && typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState : null
      const menuState = useMenuOpenState ? useMenuOpenState() : null
      const setMenuOpen = menuState && typeof menuState[1] === 'function' ? menuState[1] : null

      const onSelect = useCallback(() => {
        if (setMenuOpen) setMenuOpen(false)
        window.dispatchEvent(new CustomEvent(EVENT, {
          detail: { sessionId, title, running: false },
        }))
      }, [sessionId, title, setMenuOpen])

      return React.createElement(MenuItemButton, {
        icon: React.createElement(TrashIcon, { size: 16 }),
        danger: true,
        separatorBefore: true,
        onSelect,
      }, t('menu.delete'))
    }

    // --- apply ------------------------------------------------------------------

    // Adopt the client locale service: register our zh/en dictionaries (the
    // lookup chain falls back to zh, so a missing en entry still renders).
    // Disposal of the dictionary registration rides the plugin fiber through
    // ctx.effect.
    function adoptLocale(locale, ctx) {
      if (!locale) return
      __locale = locale
      try {
        if (typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, { zh: zhDict, en: enDict }))
        }
      } catch { /* namespace already registered: keep the existing copy */ }
    }

    function apply(ctx) {
      // The client sessions service (list store, refreshList, open) powers the
      // dialog: title resolution and in-place list refresh after deletion.
      // Grab it now; if it is not ready yet, a deferred inject refreshes the
      // module-level handle and the dialog picks it up.
      __sessionsSvc = ctx.get('sessions')
      if (!__sessionsSvc) {
        ctx.inject(['sessions'], (sub) => {
          __sessionsSvc = sub.sessions
        })
      }
      // The locale service drives the zh/en copy. Absent a deferred inject
      // (minimal compositions), `__t` falls back to the built-in dicts.
      adoptLocale(ctx.get('locale'), ctx)
      if (!__locale) {
        ctx.inject(['locale'], (sub) => {
          adoptLocale(sub.locale, ctx)
        })
      }
      // `locale: NS` gives the registered components the `t` seat (the
      // renderer re-derives it on every locale switch); without the service
      // the components fall back to `__t` + useLocaleRevision().
      ctx.slots.inject(SLOT, () => ctx.slots.register({
        name: SLOT,
        id: ROW_ID,
        order: 30,
        ...(__locale ? { locale: NS } : {}),
      }, DeleteSessionButton))
      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: DIALOG_ID,
        order: 100,
        ...(__locale ? { locale: NS } : {}),
      }, DeleteSessionDialog))
      // The sidebar session-row "..." menu's delete row. ui-workspace declares
      // this slot from 0.2.x on; on a runtime without the declaration the
      // inject simply never fires and the other entry points keep working.
      ctx.slots.inject(SIDEBAR_MENU_SLOT, () => ctx.slots.register({
        name: SIDEBAR_MENU_SLOT,
        id: SIDEBAR_MENU_ID,
        order: SIDEBAR_MENU_ORDER,
        ...(__locale ? { locale: NS } : {}),
      }, SidebarDeleteMenuItem))
    }

    // The loader gates apply() until the declared services exist.
    return { apply, inject: ['slots'] }
  },
})
