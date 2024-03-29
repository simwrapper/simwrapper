import styles from '@/components/ColorMapSelector/ColorMapSelector.module.css'

import React from 'react'
import { FiShuffle } from 'react-icons/fi'

import type { ColorMap } from './models'
import Selector from '@/components/Selector/Selector'
import ToggleBtn from './ToggleBtn'
import ColorMapOption from './ColorMapOption'
import { COLORMAP_GROUPS } from './groups'

interface Props {
  value: ColorMap
  invert: boolean
  onValueChange: (colorMap: ColorMap) => void
  onInversionChange: () => void
}

function ColorMapSelector(props: Props) {
  const { value, onValueChange, invert, onInversionChange } = props

  return (
    <div className={styles.selectorWrapper}>
      <Selector
        value={value}
        onChange={onValueChange}
        options={COLORMAP_GROUPS}
        optionComponent={ColorMapOption}
      />
      <ToggleBtn
        small
        label="Invert"
        icon={FiShuffle}
        value={invert}
        onToggle={onInversionChange}
      />
    </div>
  )
}

export default ColorMapSelector
