// apps/mobile/components/CardActions.tsx
// What a held card can do, for a screen of cards (Home, a project): the hold arc's actions per kind of card, and
// what they open — the Share sheet, the Add context sheet, Link ideas mode and its toast.
//   Ideas        Like · Link ideas · Add context · Share
//   Suggestions  Keep · Not for this project · Link ideas · Share   (More ideas tab)
//   To-dos       Done · Date · Share
// The idea page's ••• offers the same actions as a list (app/idea/[id].tsx).

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActionSheetIOS, Share, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import type { ActionItem, CardItem, Item } from '@/lib/home'
import { setHeart } from '@/lib/idea'
import { link, linkedLine, suggestedLinks, unlink, type Links } from '@/lib/links'
import { changeDate, isoDay, loadTodo, setTodoDone } from '@/lib/todo'
import { dismissSuggestion, pinSuggestion, type Suggestion } from '@/lib/suggestions'
import type { HoldAction } from '@/components/HoldArc'
import { LinkDone, LinkLines, Toast, type LinkLinesHandle, type LinkMark } from '@/components/LinkMode'
import { ShareSheet } from '@/components/ShareSheet'
import { AddContextSheet } from '@/components/AddContextSheet'

export interface Linking {
  from: CardItem
  /** Linked to `from` now, both ways. */
  linked: Set<string>
  /** Linked in this session — what Undo takes back. */
  added: string[]
  /** Ivy's open merge suggestions for `from`: shown as suggested links. */
  suggested: Set<string>
}

export function useCardActions({
  links,
  reload,
  findCard,
}: {
  links: Links | undefined
  /** Load the screen again (after a change the screen shows). */
  reload: () => Promise<unknown> | void
  /** A card on this screen by id — Link ideas from a suggestion she's just kept starts from its new card. */
  findCard?: (id: string) => CardItem | undefined
}) {
  const supabase = useSupabase()
  const { userId } = useAuth()
  const [share, setShare] = useState<CardItem | null>(null)
  const [context, setContext] = useState<CardItem | null>(null)
  const [linking, setLinking] = useState<Linking | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const lines = useRef<LinkLinesHandle>(null)
  const views = useRef(new Map<string, View>()).current
  const viewRefs = useRef(new Map<string, (v: View | null) => void>()).current

  const say = useCallback((text: string) => setToast({ text }), [])
  const fail = useCallback((e: unknown) => say(e instanceof Error ? e.message : 'That didn’t work'), [say])

  // ── Link ideas ──
  const startLinking = useCallback(
    async (from: CardItem) => {
      setLinking({ from, linked: new Set(links?.get(from.id) ?? []), added: [], suggested: new Set() })
      try {
        const suggested = await suggestedLinks(supabase, from.id)
        setLinking((l) => (l && l.from.id === from.id ? { ...l, suggested } : l))
      } catch (e) {
        console.warn(`[links] suggestions: ${e instanceof Error ? e.message : e}`)
      }
    },
    [links, supabase]
  )

  const toggleLink = useCallback(
    async (item: Item) => {
      if (!linking || !userId || item.kind !== 'card' || item.id === linking.from.id) return
      const from = linking.from.id
      const on = linking.linked.has(item.id)
      // Shown at once; put back if the write fails.
      const next = (l: Linking, add: boolean): Linking => {
        const linked = new Set(l.linked)
        if (add) linked.add(item.id)
        else linked.delete(item.id)
        return { ...l, linked, added: add ? [...l.added, item.id] : l.added.filter((x) => x !== item.id) }
      }
      setLinking((l) => (l ? next(l, !on) : l))
      try {
        if (on) await unlink(supabase, from, item.id)
        else await link(supabase, userId, from, item.id, linking.suggested.has(item.id) ? 'ivy' : 'creator')
      } catch (e) {
        setLinking((l) => (l ? next(l, on) : l))
        fail(e)
      }
      lines.current?.remeasure()
    },
    [linking, userId, supabase, fail]
  )

  const doneLinking = useCallback(() => {
    if (!linking) return
    const { from, added } = linking
    setLinking(null)
    reload()
    if (added.length === 0) return
    setToast({
      text: linkedLine(added.length),
      undo: async () => {
        setToast(null)
        try {
          await Promise.all(added.map((id) => unlink(supabase, from.id, id)))
        } catch (e) {
          fail(e)
        }
        reload()
      },
    })
  }, [linking, reload, supabase, fail])

  const markFor = useCallback(
    (item: Item): LinkMark | null => {
      if (!linking) return null
      if (item.kind === 'action') return 'dimmed'
      if (item.id === linking.from.id) return 'from'
      if (linking.linked.has(item.id)) return 'linked'
      return linking.suggested.has(item.id) ? 'suggested' : 'open'
    },
    [linking]
  )

  // ── The arc ──
  const actionsFor = useCallback(
    (item: Item): HoldAction[] => {
      if (item.kind === 'action') return todoActions(item)
      return [
        {
          key: 'like',
          label: item.heartedAt ? 'Unlike' : 'Like',
          icon: item.heartedAt ? 'heart.fill' : 'heart',
          run: () => setHeart(supabase, item.id, !item.heartedAt).then(() => reload(), fail),
        },
        { key: 'link', label: 'Link ideas', icon: 'link', run: () => startLinking(item) },
        { key: 'context', label: 'Add context', icon: 'mic', run: () => setContext(item) },
        { key: 'share', label: 'Share', icon: 'square.and.arrow.up', run: () => setShare(item) },
      ]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, reload, fail, startLinking]
  )

  function todoActions(t: ActionItem): HoldAction[] {
    return [
      {
        key: 'done',
        label: t.done ? 'Not done' : 'Done',
        icon: t.done ? 'arrow.uturn.backward' : 'checkmark',
        run: () => setTodoDone(supabase, t.id, !t.done).then(() => reload(), fail),
      },
      { key: 'date', label: 'Date', icon: 'calendar', run: () => pickDate(t) },
      { key: 'share', label: 'Share', icon: 'square.and.arrow.up', run: () => Share.share({ message: t.text }) },
    ]
  }

  function pickDate(t: ActionItem) {
    const now = new Date()
    const at = (days: number) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days))
    const toSat = (6 - now.getDay() + 7) % 7 || 7
    const toMon = (8 - now.getDay()) % 7 || 7
    const options: [string, string | null][] = [
      ['Today', at(0)],
      ['Tomorrow', at(1)],
      ['This weekend', at(toSat)],
      ['Next week', at(toMon)],
      ['Pick a day…', null],
    ]
    ActionSheetIOS.showActionSheetWithOptions(
      { title: t.text, options: [...options.map((o) => o[0]), 'Cancel'], cancelButtonIndex: options.length },
      async (i) => {
        const o = options[i]
        if (!o) return
        if (!o[1]) return router.push(`/todo/${t.id}`)
        try {
          const todo = await loadTodo(supabase, t.id)
          if (!todo) throw new Error('This to-do has gone.')
          await changeDate(supabase, todo, o[1])
          say(`Moved to ${o[0].toLowerCase()}.`)
          reload()
        } catch (e) {
          fail(e)
        }
      }
    )
  }

  const suggestionActions = useCallback(
    (s: Suggestion, onGone: (s: Suggestion) => void): HoldAction[] => [
      {
        key: 'keep',
        label: 'Keep',
        icon: 'pin',
        run: async () => {
          onGone(s)
          try {
            await pinSuggestion(supabase, s.id)
            say('Kept in this project.')
          } catch (e) {
            fail(e)
          }
          reload()
        },
      },
      {
        key: 'not',
        label: 'Not for this project',
        icon: 'eye.slash',
        run: () => {
          onGone(s)
          dismissSuggestion(supabase, s.id).then(() => reload(), fail)
        },
      },
      {
        // A suggestion isn't hers until she keeps it: Link ideas keeps it, then links from its new card.
        key: 'link',
        label: 'Link ideas',
        icon: 'link',
        run: async () => {
          onGone(s)
          try {
            const cardId = await pinSuggestion(supabase, s.id)
            await reload()
            const card = findCard?.(cardId)
            if (card) startLinking(card)
          } catch (e) {
            fail(e)
          }
        },
      },
      {
        key: 'share',
        label: 'Share',
        icon: 'square.and.arrow.up',
        run: () => Share.share({ message: [s.title, s.sourceUrl].filter(Boolean).join('\n'), url: s.sourceUrl ?? undefined }),
      },
    ],
    [supabase, reload, findCard, startLinking, say, fail]
  )

  /** A tile's view, for the link lines. Stable per id. */
  const viewRef = useCallback(
    (id: string) => {
      let r = viewRefs.get(id)
      if (!r) {
        r = (v: View | null) => {
          if (v) views.set(id, v)
          else views.delete(id)
        }
        viewRefs.set(id, r)
      }
      return r
    },
    [views, viewRefs]
  )

  /** Sheets, the link lines, Done and the toast. Render last, over the screen. `nav` is the screen's own nav. */
  const layer = (nav: ReactNode): ReactNode => (
    <>
      {linking && <LinkLines ref={lines} from={linking.from.id} to={[...linking.linked]} views={views} />}
      {linking ? <LinkDone count={linking.linked.size} onDone={doneLinking} /> : nav}
      {toast && <Toast text={toast.text} action={toast.undo ? 'Undo' : undefined} onAction={toast.undo} onGone={() => setToast(null)} />}
      {share && <ShareSheet card={share} onClose={() => setShare(null)} onShared={() => reload()} />}
      {context && <AddContextSheet card={context} onClose={() => setContext(null)} />}
    </>
  )

  return useMemo(
    () => ({
      linking,
      actionsFor,
      suggestionActions,
      markFor,
      toggleLink,
      startLinking,
      viewRef,
      remeasure: () => lines.current?.remeasure(),
      layer,
      openShare: setShare,
      openContext: setContext,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linking, actionsFor, suggestionActions, markFor, toggleLink, startLinking, viewRef, share, context, toast]
  )
}
