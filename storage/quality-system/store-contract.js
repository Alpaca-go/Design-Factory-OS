const REQUIRED_METHODS = Object.freeze(['save', 'load', 'list', 'upsertReview']);

export function defineShadowResultStore(implementation) {
  if (!implementation || typeof implementation !== 'object') throw new TypeError('Shadow result store implementation is required');
  for (const method of REQUIRED_METHODS) {
    if (typeof implementation[method] !== 'function') throw new TypeError(`Shadow result store requires ${method}()`);
  }
  return Object.freeze(Object.fromEntries(REQUIRED_METHODS.map((method) => [method, implementation[method].bind(implementation)])));
}
