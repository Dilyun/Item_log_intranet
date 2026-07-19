function Icon({ name, className = '' }) {
  return (
    <span className={`material-symbols-rounded ${className}`.trim()} aria-hidden="true">
      {name}
    </span>
  )
}

export default Icon
