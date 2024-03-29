import ndarray from 'ndarray'
import { range, tickStep } from 'd3-array'
import type { NdArray, TypedArray } from 'ndarray'
export type NumArray = TypedArray | number[]
export type AnyNumArray = NdArray<NumArray> | NumArray

export function toTypedNdArray<T extends TypedArrayConstructor>(
  arr: NdArray<NumArray>,
  Constructor: T
): NdArray<InstanceType<T>> {
  return ndarray(Constructor.from(arr.data) as InstanceType<T>, arr.shape)
}

export function getDims(dataArray: NdArray): Dims {
  const [rows, cols] = dataArray.shape
  return { rows, cols }
}

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor

export type Domain = [number, number]
export type Axis = 'x' | 'y'

export interface VisibleDomains {
  xVisibleDomain: Domain
  yVisibleDomain: Domain
}

export enum ScaleType {
  Linear = 'linear',
  Log = 'log',
  SymLog = 'symlog',
  Sqrt = 'sqrt',
  Gamma = 'gamma',
}

export type ColorScaleType = Exclude<ScaleType, 'gamma'>
export type AxisScaleType = Exclude<ScaleType, 'sqrt' | 'gamma'>

export interface Bounds {
  min: number
  max: number
  positiveMin: number
  strictPositiveMin: number
}

export interface Dims {
  rows: number
  cols: number
}

// MappedTuple<string[]> => string[]
// MappedTuple<number[]> => number[]
// MappedTuple<number[], string> => string[]
// MappedTuple<[number, number]> => [number, number]
// MappedTuple<[number, number], string> => [string, string]
export type MappedTuple<T extends unknown[], U = T[number]> = {
  [index in keyof T]: U
}

export function getAxisValues(rawValues: NumArray | undefined, axisLength: number): NumArray {
  if (!rawValues) {
    return range(axisLength)
  }

  if (rawValues.length < axisLength) {
    throw new Error(`Expected array to have length ${axisLength} at least`)
  }

  return rawValues.slice(0, axisLength)
}

export const SCALES_VALID_MINS = {
  [ScaleType.Linear]: -Infinity,
  [ScaleType.Log]: Number.MIN_VALUE,
  [ScaleType.SymLog]: -Infinity,
  [ScaleType.Sqrt]: 0,
  [ScaleType.Gamma]: -Infinity,
}
