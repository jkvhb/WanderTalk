export function isContentNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false
  const prototype = Object.getPrototypeOf(node)
  if (prototype !== Object.prototype && prototype !== null) return false
  return node.narrate !== false && node.routeType !== 'optional'
}
