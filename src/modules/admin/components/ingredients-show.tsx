import React from 'react'

const IngredientsShow = ({ record, property }: any) => {
  const raw = record?.params?.[property.path]

  let items: string[] = []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(parsed)) {
      items = parsed.filter((v: any) => typeof v === 'string')
    }
  } catch {
    return <span style={{ color: '#999' }}>—</span>
  }

  if (items.length === 0) {
    return <span style={{ color: '#999' }}>—</span>
  }

  return <span>{items.join(', ')}</span>
}

export default IngredientsShow
