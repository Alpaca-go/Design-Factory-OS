const REQUIRED_METHODS = Object.freeze([
  'constructAnchorCandidates',
  'constructPrimaryDna',
  'constructSupportingDna',
  'constructGrammarStage'
]);
const OPTIONAL_METHODS = Object.freeze(['reconstructAnchorCandidate']);

export function defineVisualLanguageProviderAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Visual Language Provider Adapter is required');
  if (typeof adapter.version !== 'string' || !adapter.version.trim()) throw new TypeError('Provider Adapter version is required');
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`Provider Adapter requires ${method}()`);
  }
  const optional = Object.fromEntries(OPTIONAL_METHODS
    .filter((method) => typeof adapter[method] === 'function')
    .map((method) => [method, adapter[method].bind(adapter)]));
  return Object.freeze({
    version: adapter.version.trim(),
    ...Object.fromEntries(REQUIRED_METHODS.map((method) => [method, adapter[method].bind(adapter)])),
    ...optional
  });
}

export function createFixtureVisualLanguageProviderAdapter(fixtures, { version = 'fixture-visual-language-provider-v1' } = {}) {
  const calls = [];
  const invoke = async (method, input) => {
    calls.push({ method, input: structuredClone(input) });
    const fixture = fixtures?.[method];
    if (typeof fixture === 'function') return structuredClone(await fixture(structuredClone(input), calls.filter((item) => item.method === method).length));
    if (fixture instanceof Error) throw fixture;
    if (fixture === undefined) throw new Error(`Missing fixture for ${method}`);
    return structuredClone(fixture);
  };
  const adapter = defineVisualLanguageProviderAdapter({
    version,
    constructAnchorCandidates: (input) => invoke('constructAnchorCandidates', input),
    constructPrimaryDna: (input) => invoke('constructPrimaryDna', input),
    constructSupportingDna: (input) => invoke('constructSupportingDna', input),
    constructGrammarStage: (input) => invoke('constructGrammarStage', input),
    ...(fixtures?.reconstructAnchorCandidate === undefined ? {} : {
      reconstructAnchorCandidate: (input) => invoke('reconstructAnchorCandidate', input)
    })
  });
  return Object.freeze({ ...adapter, getCalls: () => structuredClone(calls) });
}
