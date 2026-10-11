import { defineConfig,globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals,...nextTs,{
  rules:{'@next/next/no-img-element':'warn','react-hooks/set-state-in-effect':'off','react-hooks/refs':'off','react-hooks/purity':'off'}
},globalIgnores(['.next/**','node_modules/**','next-env.d.ts','test-results/**','playwright-report/**','.agents/**'])]);
