import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { currentRequestBudget, withRequestBudget } from './request-budget';

@Injectable()
export class RequestBudgetInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const budget = currentRequestBudget();
    if (!budget) return next.handle(); // Non-HTTP harnesses do not install middleware.

    // ALS must cover subscription, not just construction of a cold Observable.
    return new Observable((subscriber) =>
      withRequestBudget(budget, () => {
        const signal = budget.signal;
        const onAbort = () => subscriber.error(signal.reason);
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        subscriber.add(() => {
          signal.removeEventListener('abort', onAbort);
        });
        return next.handle().subscribe(subscriber);
      }),
    );
  }
}
