/// <reference types="jest" />
// The default avatar: a soft blue gradient with white Semibold initials at 40 % of the diameter, else her photo.
import { render, screen } from '@testing-library/react-native'
import { AvatarInitials, initialsOf } from '@/components/AvatarInitials'

jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: (p: object) => <View {...p} testID="photo" /> }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (p: object) => <View {...p} testID="gradient" /> }
})

describe('initialsOf', () => {
  it('one name → one initial', () => {
    expect(initialsOf('Tim')).toBe('T')
    expect(initialsOf('  maya ')).toBe('M')
  })
  it('two names → first and last', () => {
    expect(initialsOf('Tim Dwyer')).toBe('TD')
    expect(initialsOf('arabella van der berg')).toBe('AB')
  })
  it('a handle splits on its dots, dashes and underscores', () => {
    expect(initialsOf('@maya.makes')).toBe('MM')
    expect(initialsOf('studio_ivy')).toBe('SI')
  })
  it('nothing → ?', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf(null)).toBe('?')
  })
})

describe('AvatarInitials', () => {
  it('no photo: the blue gradient, white Semibold initials at 40 % of the diameter', async () => {
    await render(<AvatarInitials name="Tim Dwyer" size={50} />)
    // Hidden from VoiceOver (the name beside it is read instead), so look past that.
    const g = screen.getByTestId('gradient', { includeHiddenElements: true })
    expect(g.props.colors).toEqual(['#A9BAE6', '#7888B8'])
    expect(g.props.start).toEqual({ x: 0, y: 0 })
    expect(g.props.end).toEqual({ x: 1, y: 1 })
    expect(screen.getByText('TD', { includeHiddenElements: true })).toHaveStyle({ color: '#FFFFFF', fontWeight: '600', fontSize: 20 })
  })
  it('a photo wins over initials', async () => {
    await render(<AvatarInitials name="Tim Dwyer" size={32} uri="https://img/tim.jpg" />)
    expect(screen.getByTestId('photo')).toBeTruthy()
    expect(screen.queryByText('TD', { includeHiddenElements: true })).toBeNull()
  })
})
