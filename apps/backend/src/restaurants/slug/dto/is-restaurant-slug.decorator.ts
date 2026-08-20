import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { validateSlug } from '../slug-rules';

/** Semantic rules that cannot be expressed by Length + Matches alone. */
export function IsRestaurantSlug(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isRestaurantSlug',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && validateSlug(value) === null,
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property is not an allowed menu slug`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
