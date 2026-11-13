// Button (Build Spec §4): variants primary / secondary / ghost / danger.
// `loading` shows the 16px spinner and preserves the button's width by
// keeping the label in the layout (visually hidden behind the spinner).

export default function Button({
  variant = 'primary',
  size,
  block = false,
  loading = false,
  children,
  ...props
}) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size === 'lg' ? 'btn-lg' : '',
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          <span style={{ visibility: 'hidden' }}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
