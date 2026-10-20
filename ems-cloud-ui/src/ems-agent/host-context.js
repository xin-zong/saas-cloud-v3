let context = { user: {}, sites: [], route: {} }
export const getHostContext = () => context
export function setHostContext(value) {
  context = value
}
