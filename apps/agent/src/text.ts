/**
 * Removes markup until none is left: one pass over `<scr<b>ipt>` would leave a
 * new tag behind. Callers want plain text for the model or an emptiness check;
 * nothing here is meant to make HTML safe to render.
 */
export function stripTags(value: string, separator = ''): string {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, separator);
  } while (current !== previous);
  return current;
}
