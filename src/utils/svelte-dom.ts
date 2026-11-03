/**
 * Svelte 5's DOM client caches `Node.prototype.firstChild/nextSibling`
 * descriptors on first mount. A few Typora renderer variants expose a `Node`
 * constructor whose prototype lacks these own accessor properties, which makes
 * `mount()` throw `Cannot read properties of undefined ('get')`.
 *
 * Define the descriptors if they are missing before the first mount. Idempotent,
 * so every surface that mounts a component can call it.
 */
export function ensureSvelteDomShims() {
  const w = window as unknown as Record<string, unknown>
  if (!w.Node && w.Element) w.Node = w.Element
  const nodeCtor = w.Node as { prototype?: object } | undefined
  const proto = nodeCtor?.prototype as { childNodes?: unknown; parentNode?: unknown } | undefined
  if (!proto) return

  if (!Object.getOwnPropertyDescriptor(proto, 'firstChild')) {
    Object.defineProperty(proto, 'firstChild', {
      configurable: true,
      get(this: { childNodes?: ArrayLike<ChildNode> | null }) {
        return this.childNodes?.[0] ?? null
      },
    })
  }

  if (!Object.getOwnPropertyDescriptor(proto, 'nextSibling')) {
    Object.defineProperty(proto, 'nextSibling', {
      configurable: true,
      get(this: { parentNode?: { childNodes: ArrayLike<ChildNode> } | null }) {
        const siblings = this.parentNode?.childNodes
        if (!siblings) return null
        const index = Array.prototype.indexOf.call(siblings, this)
        return index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null
      },
    })
  }
}
