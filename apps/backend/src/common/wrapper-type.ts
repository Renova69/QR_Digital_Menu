/**
 * Wrapper type used to circumvent the ESM/CommonJS circular-dependency issue
 * that surfaces under the SWC compiler: with `emitDecoratorMetadata`, SWC emits
 * an eager reference to the injected class for `design:type` metadata. When two
 * classes import each other, that reference hits the temporal dead zone and
 * throws `Cannot access 'X' before initialization`.
 *
 * Annotating a forwardRef-injected property as `WrapperType<X>` erases the
 * concrete class from the emitted metadata, breaking the eager reference while
 * Nest's DI still resolves the dependency via `forwardRef`.
 *
 * See: https://docs.nestjs.com/recipes/swc#common-pitfalls
 */
export type WrapperType<T> = T;
