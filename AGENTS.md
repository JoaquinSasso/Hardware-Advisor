# AGENTS.md — Reglas para agentes de código

Estas reglas aplican a toda tarea en este repositorio. Si una tarea contradice este
archivo, gana la tarea, pero tenés que señalar la contradicción en tu reporte.

## Qué es este proyecto

Asesor de armado de PC para una tienda Tiendanube. El cliente conversa con un chat
(LLM); el LLM traduce lo que pide a requisitos estructurados; un motor determinístico
arma PCs compatibles usando solo productos con stock; el resultado se agrega al
carrito de la tienda o se envía por WhatsApp.

El diseño lo define un arquitecto humano. Vos implementás tareas acotadas.
**No tomás decisiones de arquitectura.**

## Estructura

```
packages/shared          Contratos: esquemas zod, tipos y formatArs. Fuente de verdad.
packages/db              Postgres: migraciones SQL, migrador, importador CSV, repositorios.
packages/engine          Lógica pura: compatibilidad y recomendación. Sin IO.
packages/advisor-client  Lógica del cliente del chat, sin DOM.
apps/api                 Backend HTTP (Hono) + cliente LLM (Gemini).
apps/devchat             Página local (Vite + TS, sin framework) para probar el chat.
apps/widget              (futuro) UI en la tienda (NubeSDK).
apps/admin               (futuro) Panel de administración.
```

Dependencias permitidas: engine → shared; db → shared; advisor-client → shared;
apps → todos. engine NUNCA importa db. shared no importa nada del proyecto.
`packages/advisor-client` no usa `document`, `window`, `localStorage` ni
`sessionStorage` (hay un test que lo verifica).

Los paquetes se consumen por sus tipos compilados (`dist/`): después de cambiar un
paquete hay que compilarlo antes de testear a quien lo usa. Por eso se usa siempre
`pnpm check`.

## Comandos

```
pnpm install
pnpm check                                                   # build + todos los tests
pnpm --filter @pcadvisor/<paquete> exec vitest run --reporter=verbose
```

Los tests no requieren red ni Docker (Postgres de tests = PGlite en memoria; el LLM
se reemplaza por un doble inyectado).

## Reglas de alcance

1. Tocá solo los archivos y paquetes que la tarea menciona. Si necesitás tocar otro,
   detenete y preguntá.
2. No agregues, quites ni renombres campos, enums, tablas, columnas, endpoints,
   headers HTTP, variables de entorno ni códigos de error que no estén en la tarea.
3. `packages/shared` es un contrato congelado: solo se modifica si la tarea lo pide
   explícitamente y exactamente como lo pide.
4. No agregues dependencias que la tarea no autorice. Las versiones van fijas o con
   `^`, nunca `*` ni `latest`. Las herramientas de desarrollo compartidas
   (typescript, vitest, fast-check) se declaran UNA sola vez en el package.json raíz.
5. Las migraciones ya existentes en `packages/db/migrations/` nunca se editan. Un
   cambio de esquema es un archivo nuevo `NNNN_descripcion.sql`, y solo si la tarea
   lo pide.
6. No cambies firmas de funciones exportadas, `tsconfig*.json` ni `package.json`
   salvo que la tarea lo pida. Todo tsconfig extiende `tsconfig.base.json` y no pisa
   sus opciones de compilación (`strict`, `noUncheckedIndexedAccess`).
7. No dejes archivos temporales, de prueba o "cambios temporales" en el repo.
8. Ante una duda o un caso no cubierto: dejá `// PREGUNTA: <descripción>` en el código,
   un `it.todo('<descripción>')` en los tests, y listalo en el reporte. No inventes la
   respuesta.

## Git

- **No crees ramas, no hagas checkout a otras ramas, no hagas merge, rebase, reset,
  push ni force-push.** Trabajás sobre la rama actual. El humano maneja el historial.
- **No hagas commits** salvo que la tarea lo pida. El humano hace commit antes de
  lanzarte para poder revisar tu diff.
- Podés usar `git status`, `git diff` y `git log` para inspeccionar.

## Tests

- No borres, saltees (`.skip`) ni debilites tests existentes para que pasen. Si un
  test existente falla por tu cambio, reportalo.
- Un test que depende de un archivo de datos del repo debe FALLAR si el archivo no
  existe, no saltearse.
- Cada test verifica una cosa con un nombre que la describa. Preferí `it.each` para
  casos tabulares: cada fila aparece por separado en el reporte.
- Los límites se verifican con igualdad exacta (`toBe`), no con rangos, salvo que la
  tarea diga otra cosa.

## Convenciones de código

- TypeScript `strict` y ESM. `import type` para todo lo que sea solo tipo.
- Evitá `any` y `as` para forzar tipos en `src/`. Si es inevitable, comentá por qué en
  la misma línea. Los datos externos se tipan validándolos con zod, no con casts.
- Validá con zod (esquemas de shared) todo dato que cruce un límite: archivos,
  base de datos, HTTP, respuestas del LLM.
- No ocultes errores de datos: no conviertas `undefined` en `null` ni uses valores
  por defecto para "arreglar" datos faltantes. Un dato inválido debe fallar.
- Un estado que el diseño considera imposible **lanza un Error** con un mensaje claro.
  No se resuelve con `return 0`, `return`, `?? valor` ni con un `if` que lo saltea.
- Nada de `console.*` en `src/`: se usa el logger inyectado. Los logs nunca incluyen
  texto de mensajes de usuarios, bodies HTTP ni secretos.
- Dinero: siempre enteros en centavos de ARS. Nunca punto flotante. El LLM recibe
  pesos; la conversión es responsabilidad del código.
- `packages/engine` es puro: sin IO, sin `Date`, sin `Math.random`, sin mutar inputs.
- Identificadores en inglés; mensajes que puede leer un cliente o el LLM, en español,
  con los valores concretos ("La mother es ATX y el gabinete acepta mATX, ITX.").
- SQL: siempre parámetros, nunca concatenar valores en el texto de la consulta.
  Transacciones con la API del driver, nunca `BEGIN`/`COMMIT` sueltos.
- UI: texto con `textContent`, nunca `innerHTML`.

## Datos sensibles

- La columna `Costo` de los CSV de Tiendanube nunca se lee, guarda ni loguea.
- `internalNotes` de un armado nunca va al LLM, a la UI ni al texto de WhatsApp.
- Secretos (tokens, API keys, URLs de base) solo por variables de entorno (`.env`,
  ignorado por git). Nunca en código, tests, fixtures ni logs.
- No commitees CSV reales (`data/` está ignorado).

## Reporte al terminar

Tu reporte debe incluir, en este orden:

1. **Archivos creados, modificados y borrados** (lista de rutas).
2. **Desvíos de la tarea**: todo lo que hiciste distinto a lo pedido y por qué. Si no
   hubo, decí "Ninguno".
3. **Preguntas** (`// PREGUNTA:` dejadas).
4. **Salida real** de `pnpm check` y de vitest con `--reporter=verbose` de cada
   paquete tocado, copiada, no resumida.
5. Lo que la tarea pida además (diffs, contenidos de archivos).

No afirmes que algo existe, se verificó o pasa sin mostrar la evidencia. Si no pudiste
verificar algo, decilo explícitamente.
