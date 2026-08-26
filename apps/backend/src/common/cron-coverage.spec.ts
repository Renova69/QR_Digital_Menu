import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type CronJob = {
  cronSchedule: string;
  decorators: string[];
  file: string;
  method: string;
  monitorSchedule?: string;
  monitorSlug?: string;
  named: boolean;
  waitForCompletion: boolean;
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      return [];
    }
    return [absolutePath];
  });
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  const target = ts.isCallExpression(expression)
    ? expression.expression
    : expression;
  return ts.isIdentifier(target) ? target.text : undefined;
}

function cronOptions(decorator: ts.Decorator): {
  named: boolean;
  waitForCompletion: boolean;
} {
  if (!ts.isCallExpression(decorator.expression)) {
    return { named: false, waitForCompletion: false };
  }

  const options = decorator.expression.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) {
    return { named: false, waitForCompletion: false };
  }

  const properties = new Map(
    options.properties.flatMap((property) => {
      if (
        !ts.isPropertyAssignment(property) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      ) {
        return [];
      }
      return [[property.name.text, property.initializer] as const];
    }),
  );

  const name = properties.get('name');
  const waitForCompletion = properties.get('waitForCompletion');
  return {
    named: Boolean(name && ts.isStringLiteral(name) && name.text.length > 0),
    waitForCompletion: waitForCompletion?.kind === ts.SyntaxKind.TrueKeyword,
  };
}

function discoverCronJobs(): CronJob[] {
  const sourceRoot = path.resolve(__dirname, '..');
  const jobs: CronJob[] = [];

  for (const file of sourceFiles(sourceRoot)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && ts.canHaveDecorators(node)) {
        const decorators = ts.getDecorators(node) ?? [];
        const names = decorators
          .map(decoratorName)
          .filter((name): name is string => Boolean(name));
        const cronIndex = names.indexOf('Cron');
        if (cronIndex >= 0) {
          const options = cronOptions(decorators[cronIndex]);
          const cronExpression = decorators[cronIndex].expression;
          const sentryIndex = names.indexOf('SentryCron');
          const sentryExpression = decorators[sentryIndex]?.expression;
          const monitorExpression =
            sentryExpression && ts.isCallExpression(sentryExpression)
              ? sentryExpression.arguments[1]
              : undefined;
          jobs.push({
            cronSchedule: ts.isCallExpression(cronExpression)
              ? cronExpression.arguments[0]?.getText(source)
              : '',
            decorators: names,
            file: path.relative(sourceRoot, file).replaceAll('\\', '/'),
            method: node.name.getText(source),
            monitorSchedule:
              monitorExpression && ts.isCallExpression(monitorExpression)
                ? monitorExpression.arguments[0]?.getText(source)
                : undefined,
            monitorSlug:
              sentryExpression &&
              ts.isCallExpression(sentryExpression) &&
              ts.isStringLiteral(sentryExpression.arguments[0])
                ? sentryExpression.arguments[0].text
                : undefined,
            ...options,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return jobs.sort((left, right) =>
    `${left.file}:${left.method}`.localeCompare(
      `${right.file}:${right.method}`,
    ),
  );
}

describe('scheduled-job monitoring coverage', () => {
  const jobs = discoverCronJobs();

  it('keeps the reviewed cron inventory explicit', () => {
    expect(jobs).toHaveLength(20);
  });

  it('names every cron and prevents overlapping executions', () => {
    expect(
      jobs
        .filter((job) => !job.named || !job.waitForCompletion)
        .map((job) => `${job.file}:${job.method}`),
    ).toEqual([]);
  });

  it('wraps every cron with Sentry in the decorator order Nest registers', () => {
    expect(
      jobs
        .filter(
          (job) =>
            job.decorators.indexOf('SentryCron') !==
            job.decorators.indexOf('Cron') + 1,
        )
        .map((job) => `${job.file}:${job.method}`),
    ).toEqual([]);
  });

  it('keeps monitor identities unique and schedules derived from the cron', () => {
    expect(
      jobs
        .filter((job) => job.monitorSchedule !== job.cronSchedule)
        .map((job) => `${job.file}:${job.method}`),
    ).toEqual([]);

    const monitorSlugs = jobs.map((job) => job.monitorSlug);
    expect(monitorSlugs.every(Boolean)).toBe(true);
    expect(new Set(monitorSlugs).size).toBe(monitorSlugs.length);
  });
});
