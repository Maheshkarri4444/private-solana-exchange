// Vercel's entry: the API as one function, from the build's output (`npm run
// build` compiles src/ to dist/ first, see vercel.json). Locally the server is
// src/index.ts (npm run dev), which also runs the indexer and the settler.
export { default } from "./dist/index.js";
