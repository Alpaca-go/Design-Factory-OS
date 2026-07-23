import { AntiPatternRegistry } from '../anti-pattern-registry.js';
import { createPhase2RuleDefinitions } from './phase-2-rules.js';

export function createPhase2Registry(options = {}) {
  return new AntiPatternRegistry().registerMany(createPhase2RuleDefinitions(options));
}
