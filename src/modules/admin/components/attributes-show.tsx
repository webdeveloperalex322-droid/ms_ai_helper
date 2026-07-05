import React from 'react'

const AttributesShow = ({ record, property }: any) => {
  const params: Record<string, any> = record?.params ?? {}
  const prefix = `${property.path}.`

  // params are flat: attributes.0.id, attributes.0.name, attributes.1.name, etc.
  const indices = new Set<number>()
  Object.keys(params).forEach((key) => {
    if (key.startsWith(prefix)) {
      const idx = parseInt(key.slice(prefix.length).split('.')[0], 10)
      if (!isNaN(idx)) indices.add(idx)
    }
  })

  const attrs = Array.from(indices)
    .sort((a, b) => a - b)
    .map((i) => ({
      id: params[`${prefix}${i}.id`] as string,
      name: params[`${prefix}${i}.name`] as string,
    }))
    .filter((a) => a.name)

  if (attrs.length === 0) {
    return <span style={{ color: '#999' }}>—</span>
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
      {attrs.map((attr, i) => (
        <span
          key={attr.id ?? i}
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            background: '#f0f4ff',
            border: '1px solid #c7d4f0',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#2d4a8a',
          }}
        >
          {attr.name}
        </span>
      ))}
    </div>
  )
}

export default AttributesShow
