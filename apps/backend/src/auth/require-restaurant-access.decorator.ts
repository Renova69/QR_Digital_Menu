import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiParam, ApiQuery } from '@nestjs/swagger';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import {
  getRestaurantAccess,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessRequirement,
} from './restaurant-access.policy';

/** Authentication always runs first, at the same scope as the access guard.
 * Class defaults may be narrowed/retargeted by a method declaration. */
export function RequireRestaurantAccess(
  requirement: RestaurantAccessRequirement,
) {
  return applyDecorators(
    SetMetadata(RESTAURANT_ACCESS_KEY, Object.freeze({ ...requirement })),
    UseGuards(JwtAuthGuard, RestaurantAccessGuard),
    ...(requirement.source === 'params'
      ? [ApiParam({ name: requirement.key, type: String, required: true })]
      : requirement.source === 'query'
        ? [
            ApiQuery({
              name: requirement.key,
              type: String,
              required: !['print-management', 'service-list'].includes(
                requirement.policy,
              ),
            }),
          ]
        : []), // Body schemas remain owned by the route's DTO.
  );
}

export const AuthorizedRestaurant = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const access = getRestaurantAccess(
      context.switchToHttp().getRequest<object>(),
    );
    if (!access)
      throw new InternalServerErrorException(
        'Restaurant access guard did not run',
      );
    return access;
  },
);
