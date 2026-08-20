/**
 * Vendored from deck.gl (MIT):
 *   @deck.gl/layers/src/geojson-layer/sub-layer-map.ts
 *
 * `forwardProps` is internal to deck.gl and not part of its public API, so the only way
 * to reach it was a deep import into `node_modules/@deck.gl/layers/src/...`. deck.gl
 * publishes its TypeScript *source*, so that import made `tsc` pull in and type-check the
 * whole deck.gl layers source tree -- 63 errors in code we don't own and can't fix.
 *
 * Copied verbatim (only the parameter types were loosened) so runtime behaviour is
 * unchanged. If deck.gl is upgraded, re-check this against the upstream file.
 */
export function forwardProps(layer: any, mapping: Record<string, string>): Record<string, any> {
  const { transitions, updateTriggers } = layer.props
  const result: Record<string, any> = {
    updateTriggers: {},
    transitions: transitions && {
      getPosition: transitions.geometry,
    },
  }

  for (const sourceKey in mapping) {
    const targetKey = mapping[sourceKey]
    let value = layer.props[sourceKey]
    if (sourceKey.startsWith('get')) {
      // isAccessor
      value = layer.getSubLayerAccessor(value)
      result.updateTriggers[targetKey] = updateTriggers[sourceKey]
      if (transitions) {
        result.transitions[targetKey] = transitions[sourceKey]
      }
    }
    result[targetKey] = value
  }
  return result
}
