// Walking a defaults object for its string leaves.
//
// Shared because three suites need it for the same reason. `DEFAULT_HOME`,
// `DEFAULT_GLOBAL` and `DEFAULT_SEO` are each compared against themselves by
// the sanitizer tests — the production code fills gaps *from* those constants,
// so `expect(sanitize(x)).toEqual(DEFAULT)` cannot notice a blanked default.
// Asserting a property of every leaf is what closes that, and doing it by
// walking rather than by copying is what stops the assertion going stale on
// the next copy edit.

/** Every string leaf of an object, as `[dotted.path, value]`. */
export function stringLeaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => stringLeaves(v, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      stringLeaves(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}

/**
 * Split leaves into the ones that must carry text and the ones that must not.
 *
 * Returned as a pair so a suite can assert both directions, and so the
 * "required" list can be checked for emptiness before it is fed to `it.each` —
 * an `it.each([])` registers no tests at all and passes silently, which is the
 * failure this helper exists to make impossible rather than merely unlikely.
 */
export function splitLeaves(
  value: unknown,
  intentionallyEmpty: Iterable<string>
): { required: [string, string][]; empty: string[] } {
  const empty = [...intentionallyEmpty];
  const emptySet = new Set(empty);
  const required = stringLeaves(value).filter(([path]) => !emptySet.has(path));

  return { required, empty };
}
