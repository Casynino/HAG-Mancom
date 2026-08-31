// `server-only` throws when resolved outside a React Server Component. Modules
// under test legitimately carry that marker, so it is aliased to this no-op for
// the test run rather than removed from the source.
export {}
