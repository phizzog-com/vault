import { jest } from '@jest/globals'

// Mock @tauri-apps/api/path module
export const dirname = jest.fn((p) => Promise.resolve(p.split('/').slice(0, -1).join('/')))
export const basename = jest.fn((p) => Promise.resolve(p.split('/').pop()))
export const join = jest.fn((...parts) => Promise.resolve(parts.join('/')))

export default {
  dirname,
  basename,
  join
}
