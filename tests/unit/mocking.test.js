import { vi, beforeEach } from 'vitest'

test('mock a method', () => {
  const mock = vi.fn(() => 'i got mocked')

  let result = mock('foo')

  expect(result).toBeDefined()
  expect(mock('foo')).toBe('i got mocked')
  expect(mock).toHaveBeenCalled()
  expect(mock).toHaveBeenCalledTimes(2)
  expect(mock).toHaveBeenCalledWith('foo')
})
