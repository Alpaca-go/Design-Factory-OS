import { VALIDATION_ORDER } from './constants.js';

export class ValidatorContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidatorContractError';
    this.code = 'VALIDATOR_CONTRACT_INVALID';
  }
}

export function defineValidator({ name, stage, validate }) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidatorContractError('Validator name must be a non-empty string');
  }
  if (!VALIDATION_ORDER.includes(stage) || stage === 'status_resolution') {
    throw new ValidatorContractError(`Unsupported validator stage: ${stage}`);
  }
  if (typeof validate !== 'function') {
    throw new ValidatorContractError(`${name}.validate must be a function`);
  }

  return Object.freeze({
    name: name.trim(),
    stage,
    async validate(context) {
      if (!context || typeof context !== 'object' || Array.isArray(context)) {
        throw new ValidatorContractError(`${name} requires a validation context object`);
      }
      const result = await validate(context);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new ValidatorContractError(`${name} must return a result object`);
      }
      return result;
    }
  });
}

export function assertValidatorForStage(validator, stage) {
  if (!validator || validator.stage !== stage || typeof validator.validate !== 'function') {
    throw new ValidatorContractError(`A ${stage} validator is required`);
  }
  return validator;
}
