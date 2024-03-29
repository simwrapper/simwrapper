import React from 'react'
import Selector from '@/components/Selector/Selector'
import ScaleOption from './ScaleOption'
import { ScaleType } from './ScaleOption'

interface Props<T extends ScaleType> {
  label?: string
  value: T
  onScaleChange: (scale: T) => void
  options: T[]
}

function ScaleSelector<T extends ScaleType>(props: Props<T>) {
  const { label, value, onScaleChange, options } = props

  return (
    <Selector
      label={label}
      value={value}
      onChange={onScaleChange}
      options={options}
      optionComponent={ScaleOption}
    />
  )
}

export default ScaleSelector
