import { LegendItem } from '@/Globals'
import React from 'react'

export default function Component(props: {
  title: string
  description?: string
  values: number[]
  items: LegendItem[]
}) {
  const listItems = props.items.map(item => (
    <li key={item.value + item.value[0]}>
      <div
        style={{
          width: '100%',
          height: `${Math.max(1, 3.0 * (1 * item.value - 1) + 3)}px`,
          backgroundColor: `rgb(${item.color})`,
        }}
      ></div>
      {item.label && <div style={{ marginBottom: '0.5rem' }}>{item.label}</div>}
    </li>
  ))

  return (
    <div>
      <h4
        style={{
          color: 'white',
          textAlign: 'left',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          fontSize: '0.8rem',
        }}
      >
        {props.title}
      </h4>
      <p>{props.description}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{listItems}</ul>
    </div>
  )
}
