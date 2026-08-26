// Indexing helpers for tests.
//
// With `noUncheckedIndexedAccess` on, `list[0]` is `T | undefined`, which a
// test that means "the first element, which is definitely there" has to work
// around. Writing `list[0]?.title` is the wrong workaround: it converts a
// missing element into a comparison against `undefined`, so a suite that
// produced an empty list fails with "expected undefined to be 'Flats'" instead
// of saying the list was empty.
//
// These helpers assert the shape instead, so the failure names the real
// problem, and hand back a definite value that narrowing works on:
//
//   const block = at(out, 0);
//   if (block.type !== "gallery") throw new Error("expected gallery");
//   expect(block.images).toHaveLength(2);   // narrowing sticks on a const

/** The element at `index`, throwing a descriptive error if it isn't there. */
export function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(
      `Expected an element at index ${index}, but the list has ${list.length}.`
    );
  }
  return value;
}

/** The sole element of a list that is expected to hold exactly one. */
export function only<T>(list: readonly T[]): T {
  if (list.length !== 1) {
    throw new Error(`Expected exactly one element, got ${list.length}.`);
  }
  return at(list, 0);
}

/** The value at `key`, throwing if the record has no entry for it. */
export function prop<T>(record: Record<string, T>, key: string): T {
  const value = record[key];
  if (value === undefined) {
    throw new Error(
      `Expected a "${key}" entry, but the record has: ${Object.keys(record).join(", ") || "(none)"}.`
    );
  }
  return value;
}
