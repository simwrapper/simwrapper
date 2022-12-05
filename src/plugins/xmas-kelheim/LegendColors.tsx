import { LegendItem } from '@/Globals'
import React from 'react'

export default function Component(props: {
  title: string
  description?: string
  values: number[]
  items: LegendItem[]
  mobile: boolean
}) {
  const regStyle = { display: 'flex' } as any
  const mobileStyle = { boxSizing: 'border-box', float: 'left', marginRight: '0.5rem' } as any

  const listItems = props.items.map(item => (
    <li key={item.value + item.value[0]} style={props.mobile ? mobileStyle : regStyle}>
      {item.label && (
        <div
          style={{
            margin: '0 0.5rem 0.0rem 0',
            fontWeight: 'bold',
          }}
        >
          {item.label}
        </div>
      )}
      <div
        style={{
          width: props.mobile ? '3rem' : '100%',
          height: `3px`,
          marginTop: '0.5rem',
          backgroundColor: `rgb(${item.color})`,
        }}
      ></div>
    </li>
  ))

  return (
    <div>
      <h4
        style={{
          textAlign: 'left',
          fontWeight: 'bold',
          margin: '1rem 0 0.25rem 0',
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
