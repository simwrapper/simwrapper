import * as cartoColors from 'cartocolor'
import type { RGBA, RGB } from '../types'

export const hexToRgba = (hex: string, alpha: number = 1): RGBA => {
  const bytes = hex.replace('#', '').match(/.{1,2}/g) || ['80', '80', '80']
  return [
    parseInt(bytes[0], 16),
    parseInt(bytes[1], 16),
    parseInt(bytes[2], 16),
    Math.round(alpha * 255),
  ]
}

export const hexToRgb = (hex: string): RGB => {
  const [r, g, b] = hexToRgba(hex, 1)
  return [r, g, b]
}

export const toNumber = (value: any): number | null => {
  const num = Number(value)
  return isNaN(num) ? null : num
}

export const buildColorEncoder = (
  values: any[],
  style: any,
  dataRange: [number, number] | null = null
) => {
  const s = style || {}
  const nums: number[] = []
  for (const v of values) {
    let num = toNumber(v)
    if (num === null) continue
    if (dataRange) num = Math.max(dataRange[0], Math.min(dataRange[1], num))
    nums.push(num)
  }

  const min = s.range?.[0] ?? (nums.length ? Math.min(...nums) : 0)
  const max = s.range?.[1] ?? (nums.length ? Math.max(...nums) : 1)

  // Get palette colors
  const paletteName = s.palette || 'YlGn'
  const numColors = s.numColors || 7
  const palette = (cartoColors as any)[paletteName]
  let hexColors: string[]
  if (!palette) {
    hexColors = Array(numColors).fill('#808080')
  } else {
    const sizes = Object.keys(palette).map(Number).filter(n => n > 0).sort((a, b) => a - b)
    const size = sizes.find(sz => sz >= numColors) || sizes[sizes.length - 1]
    hexColors = palette[size] || Array(numColors).fill('#808080')
  }
  const colors = hexColors.map(h => hexToRgba(h, 1))

  const scale = max === min ? 0 : (numColors - 1) / (max - min)

  return (value: any): RGBA => {
    const num = toNumber(value) ?? min
    const idx = Math.round((num - min) * scale)
    return colors[Math.max(0, Math.min(numColors - 1, idx))]
  }
}

export const buildCategoryEncoder = (colors: Record<string, string>, defaultColor = '#808080') => {
  const colorMap = new Map<string, RGBA>()
  for (const [key, hex] of Object.entries(colors)) {
    colorMap.set(String(key), hexToRgba(hex, 1))
  }
  const defaultRgba = hexToRgba(defaultColor, 1)
  return (value: any): RGBA => colorMap.get(String(value)) || defaultRgba
}
