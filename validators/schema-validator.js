import { VALIDATION_STAGES } from './constants.js';
import { defineValidator } from './validator-contract.js';

export function createSchemaValidator(validateOutput) {
  if (typeof validateOutput !== 'function') throw new TypeError('validateOutput must be a function');

  return defineValidator({
    name: 'schema-validator',
    stage: VALIDATION_STAGES.SCHEMA,
    async validate(context) {
      const result = await validateOutput(context.output, context);
      if (result === true || result === undefined) return { valid: true, errors: [] };
      if (result === false) return { valid: false, errors: [{ path: '', message: 'Output does not match the module schema' }] };
      if (typeof result.valid !== 'boolean' || !Array.isArray(result.errors)) {
        throw new TypeError('Schema validator must return true, false, or { valid, errors }');
      }
      return { valid: result.valid, errors: result.errors.map(normalizeSchemaError) };
    }
  });
}

function normalizeSchemaError(error) {
  if (typeof error === 'string') return { path: '', message: error };
  return {
    path: typeof error?.path === 'string' ? error.path : '',
    message: typeof error?.message === 'string' && error.message ? error.message : 'Schema validation failed'
  };
}
