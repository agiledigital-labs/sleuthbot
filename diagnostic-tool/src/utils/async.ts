/**
 * Returns a promise that resolves after the specified delay
 *
 * @param delay the delay in milliseconds
 */
const delayFor = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));

/**
 * A function to repeat an asynchronous action until it returns a value.
 * It will then pass through that value.
 *
 * Useful to perform polling functions that need to be repeated until a condition is true.
 *
 * @param fn the function that performs the asynchronous action
 * @param maxAttempts the maximum number of times that fn will be called
 * @param delay the delay in milliseconds between each invocation of fn
 * @param attempt the number of times that the function has been invoked. Used internally to run the function recursively.
 */
export const repeatWhileUndefined = async <T>(
  fn: () => Promise<T | undefined>,
  maxAttempts = 10,
  delay = 3000,
  attempt = 0
): Promise<T | undefined> => {
  const result = await fn();
  if (result === undefined) {
    // eslint-disable-next-line no-console
    console.log(`Result was undefined, Will try again after [${delay}] ms`);
    await delayFor(delay);
    // eslint-disable-next-line unused-imports/no-unused-vars-ts
    return await repeatWhileUndefined(fn, maxAttempts, delay, attempt + 1);
  } else {
    return result;
  }
};
