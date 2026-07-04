import React from 'react'

const ImagePreview = ({ record, property }: any) => {
  const url = record?.params?.[property.path]
  if (!url) return <span>—</span>
  return (
    <img
      src={url}
      alt="product"
      style={{
        maxWidth: '300px',
        maxHeight: '300px',
        objectFit: 'contain',
        display: 'block',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        marginTop: '4px',
      }}
    />
  )
}

export default ImagePreview
