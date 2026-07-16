const stringArray = {
  type: 'array',
  items: { type: 'string', minLength: 1 }
};

export const GPT_IMAGE_TASK_V2_JSON_SCHEMA = Object.freeze({
  name: 'gpt_image_task_v2',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['imageTasks'],
    properties: {
      imageTasks: {
        type: 'array',
        minItems: 4,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'systemId',
            'sequence',
            'title',
            'role',
            'objective',
            'brandDnaBasis',
            'viewerTakeaway',
            'subject',
            'environment',
            'narrativeMoment',
            'composition',
            'focalHierarchy',
            'cameraAndPerspective',
            'colorDirection',
            'materialAndTexture',
            'lighting',
            'atmosphere',
            'requiredElements',
            'optionalElements',
            'prohibitedElements',
            'lockedAssetInstructions',
            'textPolicy',
            'allowedText',
            'logoPolicy',
            'consistencyWithGlobalSystem',
            'consistencyWithPreviousTasks',
            'intentionalDifferenceFromPreviousTasks',
            'aspectRatio',
            'outputResponsibility',
            'finalPrompt'
          ],
          properties: {
            id: { type: 'string', minLength: 1 },
            systemId: { type: 'string', minLength: 1 },
            sequence: { type: 'integer', minimum: 1 },
            title: { type: 'string', minLength: 1 },
            role: {
              type: 'string',
              enum: [
                'anchor-image',
                'brand-poster',
                'product-or-service-scene',
                'packaging-concept',
                'visual-system',
                'application-scene',
                'detail-craft',
                'custom'
              ]
            },
            objective: { type: 'string', minLength: 1 },
            brandDnaBasis: { ...stringArray, minItems: 1 },
            viewerTakeaway: { type: 'string', minLength: 1 },
            subject: { type: 'string', minLength: 1 },
            environment: { type: 'string', minLength: 1 },
            narrativeMoment: { type: 'string' },
            composition: { type: 'string', minLength: 1 },
            focalHierarchy: { type: 'string', minLength: 1 },
            cameraAndPerspective: { type: 'string' },
            colorDirection: { type: 'string', minLength: 1 },
            materialAndTexture: { type: 'string', minLength: 1 },
            lighting: { type: 'string', minLength: 1 },
            atmosphere: { type: 'string' },
            requiredElements: stringArray,
            optionalElements: stringArray,
            prohibitedElements: { ...stringArray, minItems: 1 },
            lockedAssetInstructions: stringArray,
            textPolicy: { type: 'string', minLength: 1 },
            allowedText: stringArray,
            logoPolicy: { type: 'string', minLength: 1 },
            consistencyWithGlobalSystem: { ...stringArray, minItems: 1 },
            consistencyWithPreviousTasks: stringArray,
            intentionalDifferenceFromPreviousTasks: stringArray,
            aspectRatio: { type: 'string', minLength: 1 },
            outputResponsibility: { type: 'string' },
            finalPrompt: { type: 'string', minLength: 120 }
          }
        }
      }
    }
  }
});

export const STRUCTURED_PATCH_JSON_SCHEMA = Object.freeze({
  name: 'structured_patch_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['stageId', 'targetObjectId', 'operations'],
    properties: {
      stageId: { type: 'string', minLength: 1 },
      targetObjectId: { type: ['string', 'null'] },
      operations: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op', 'path', 'value'],
          properties: {
            op: { type: 'string', enum: ['add', 'replace'] },
            path: { type: 'string', pattern: '^/' },
            value: {}
          }
        }
      }
    }
  }
});
