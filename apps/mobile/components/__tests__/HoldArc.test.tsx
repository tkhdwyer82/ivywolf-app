// The hold arc with VoiceOver: the Pan is off, and the tile's long-press offers the same actions, in order, as a menu.

import { AccessibilityInfo, ActionSheetIOS, Pressable, Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Hold, HoldProvider, type HoldAction } from '@/components/HoldArc'

const metrics = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }
const run = { like: jest.fn(), link: jest.fn(), context: jest.fn(), share: jest.fn() }
const actions = (): HoldAction[] => [
  { key: 'like', label: 'Like', icon: 'heart', run: run.like },
  { key: 'link', label: 'Link ideas', icon: 'link', run: run.link },
  { key: 'context', label: 'Add context', icon: 'text.bubble', run: run.context },
  { key: 'share', label: 'Share', icon: 'square.and.arrow.up', run: run.share },
]

function Card() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <HoldProvider>
        <Hold actions={actions} face={() => <Text>face</Text>}>
          {(onLongPress) => (
            <Pressable onLongPress={onLongPress} accessibilityRole="button" accessibilityHint={onLongPress ? 'menu' : 'arc'}>
              <Text>card</Text>
            </Pressable>
          )}
        </Hold>
      </HoldProvider>
    </SafeAreaProvider>
  )
}

afterEach(() => jest.restoreAllMocks())

it('without VoiceOver, the tile has no long-press of its own (the Pan holds it)', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false)
  await render(<Card />)
  expect((await screen.findByRole('button')).props.accessibilityHint).toBe('arc')
})

it('with VoiceOver, long-press opens the actions as a menu, in order, and runs the one chosen', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
  const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, pick) => pick(1))
  await render(<Card />)
  await screen.findByHintText('menu')
  await fireEvent(screen.getByRole('button'), 'longPress')
  expect(sheet).toHaveBeenCalledTimes(1)
  expect(sheet.mock.calls[0][0]).toEqual({ options: ['Like', 'Link ideas', 'Add context', 'Share', 'Cancel'], cancelButtonIndex: 4 })
  expect(run.link).toHaveBeenCalledTimes(1)
  expect(run.like).not.toHaveBeenCalled()
})
