export type Awaitable<T> = T | PromiseLike<T>;
export type UnwrapPromise<T> = T extends PromiseLike<infer R> ? R : T;
export type RemoveVoid<T> = T extends void ? never : T;
export type Values<T> = { [K in keyof T]: any } extends { [K in keyof T]: infer R } ? R : never;

export type Plugin<T extends Plugin<T>> =  {
  [K in keyof T]: (...args: any) => any;
};

const NO_VALUE_SYMBOL = Symbol();
export const invokePlugins = async <T extends Plugin<T>, K extends keyof T>(
  plugins: T[],
  defaultPlugin: Required<T>,
  operation: K,
  ...args: Parameters<Required<T>[K]>
): Promise<RemoveVoid<UnwrapPromise<ReturnType<Required<T>[K]>>>> => {
  let value: any = NO_VALUE_SYMBOL;
  for (const plugin of plugins) {
    const opFn = plugin[operation];
    if (opFn) {
      const result: UnwrapPromise<ReturnType<Required<T>[K]>> = await opFn.apply(plugin, args);
      if (typeof result === 'string' || (typeof result === 'object' && result)) {
        value = result;
      }
    }
  }
  if (value === NO_VALUE_SYMBOL) {
    return defaultPlugin[operation].apply(defaultPlugin, args);
  }
  return value;
};
