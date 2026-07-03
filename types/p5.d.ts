// p5 ships without bundled types and we only use it to satisfy Vanta's
// global-scope dependency, so a minimal ambient declaration is enough.
declare module "p5" {
  const p5: unknown
  export default p5
}
