// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

// export function Memoize<
//   T extends (...args: any[]) => any
// >() {
//   const cache = new Map<string, ReturnType<T>>();

//   return function (fn: T, _ctx: ClassMethodDecoratorContext) {
//     return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
//       const key = JSON.stringify(args);

//       if (cache.has(key)) {
//         return cache.get(key)!;
//       }
//       const result = fn.apply(this, args);

//       // If the method is async, wait for the promise to resolve
//       if (result instanceof Promise) {
//         return result.then((resolvedResult) => {
//           cache.set(key, resolvedResult);
//           return resolvedResult;
//         }) as ReturnType<T>;
//       }

//       cache.set(key, result);
//       return result;
//     };
//   };
// }

export function Memoize(): MethodDecorator {
  return function (
    target: Object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) {
    const originalMethod = descriptor.value;
    const cache = new Map<string, unknown>();

    descriptor.value = function (...args: unknown[]) {
      const key = JSON.stringify(args);

      if (cache.has(key)) {
        return cache.get(key);
      }

      const result = originalMethod.apply(this, args);

      if (result instanceof Promise) {
        return result.then((resolved: unknown) => {
          cache.set(key, resolved);
          return resolved;
        });
      }

      cache.set(key, result);
      return result;
    };

    return descriptor;
  };
}
