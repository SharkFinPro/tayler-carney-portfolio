// Stand-in for the `server-only` package under Vitest.
//
// `server-only` exists purely to make a build fail if a server module is
// imported into a client bundle. Next aliases it away during its own build and
// it is not installed as a real dependency, so Vitest cannot resolve it. Under
// test there is no client bundle to leak into, which makes an empty module the
// correct substitute rather than a workaround.
export {};
