// apps/mobile/jest.setup.js
// Native modules jest can't load: Reanimated and Worklets use their own mocks; Gesture Handler its jest setup.
require('react-native-gesture-handler/jestSetup')
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))
