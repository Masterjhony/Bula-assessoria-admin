/// <reference types="vite/client" />

// Vite client types declare *.png (lowercase) but not *.PNG (uppercase)
declare module '*.PNG' {
  const src: string
  export default src
}
