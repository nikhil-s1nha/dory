// Ambient declarations so `tsc --noEmit` accepts imports that Metro handles at
// bundle time but the TS compiler does not know about on its own.

declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
