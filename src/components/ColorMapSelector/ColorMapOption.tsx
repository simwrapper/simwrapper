/** This file MIT Licensed from github repository h5web/app */

import React from 'react'
import { INTERPOLATORS } from './interpolators'
import type { ColorMap } from './models'
import { getLinearGradient } from './utils'
import styles from './ColorMapSelector.module.css'

interface Props {
  option: ColorMap
}

function ColorMapOption(props: Props) {
  const { option } = props
  const backgroundImage = getLinearGradient(INTERPOLATORS[option], 'right')

  return (
    <div className={styles.option}>
      {option}
      <div className={styles.gradient} style={{ backgroundImage }} data-keep-colors />
    </div>
  )
}

export default ColorMapOption
