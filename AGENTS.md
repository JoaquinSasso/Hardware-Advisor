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
packages/shared   Contratos: esquemas zod y tipos. Fuente de verdad de los formatos.
packages/db       Postgres: migraciones SQL, importador CSV, getCatalog.
packages/engine   Lógica pura: compatibilidad y recomendación. Sin IO.
apps/api          (futuro) Backend HTTP.
apps/widget       (futuro) UI en la tienda (NubeSDK).
apps/admin        (futuro) Panel de administración.
```

Dependencias permitidas: engine → shared, db → shared, apps → todos.
engine NUNCA importa db. shared no importa nada del proyecto.

## Comandos

```
pnpm install
pnpm -r build
pnpm -r test
pnpm -r test -- --reporter=verbose   # para reportar
```

Los tests no requieren red ni Docker (Postgres de tests = PGlite en memoria).

## Reglas de alcance

1. Tocá solo los archivos y paquetes que la tarea menciona. Si necesitás tocar otro,
   detenete y preguntá.
2. No agregues, quites ni renombres campos, enums, tablas, columnas, endpoints ni
   códigos de error que no estén en la tarea.
3. `packages/shared` es un contrato congelado: solo se modifica si la tarea lo pide
   explícitamente y exactamente como lo pide.
4. No agregues dependencias que la tarea no autorice. Las herramientas de desarrollo
   compartidas (typescript, vitest) se declaran UNA sola vez en el package.json raíz.
5. Las migraciones ya existentes en `packages/db/migrations/` nunca se editan. Un
   cambio de esquema es un archivo nuevo `NNNN_descripcion.sql`, y solo si la tarea
   lo pide.
6. Ante una duda o un caso no cubierto: dejá `// PREGUNTA: <descripción>` en el código,
   un `it.todo('<descripción>')` en los tests, y listalo en el reporte. No inventes la
   respuesta.

## Git

- **No crees ramas, no hagas checkout a otras ramas, no hagas merge, rebase, reset,
  push ni force-push.** Trabajás sobre la rama actual. El humano maneja el historial.
- Podés usar `git status`, `git diff` y `git log` para inspeccionar.
- Haz commit antes de cada tarea o corrección.

## Tests

- No borres, saltees (`.skip`) ni debilites tests existentes para que pasen. Si un
  test existente falla por tu cambio, reportalo.
- Un test que depende de un archivo de datos del repo debe FALLAR si el archivo no
  existe, no saltearse.
- Cada test verifica una cosa con un nombre que la describa. Preferí `it.each` para
  casos tabulares: cada fila aparece por separado en el reporte.
- No uses `console.log` en el código bajo test sin forma de silenciarlo.

## Convenciones de código

- TypeScript `strict` y ESM. `import type` para todo lo que sea solo tipo.
- Evitá `any` en `src/`. Si es inevitable, comentá por qué en la misma línea.
- Validá con zod (esquemas de shared) todo dato que cruce un límite: archivos,
  base de datos, HTTP, respuestas del LLM.
- No ocultes errores de datos: no conviertas `undefined` en `null` ni uses valores
  por defecto para "arreglar" datos faltantes. Un dato inválido debe fallar.
- Dinero: siempre enteros en centavos de ARS. Nunca punto flotante.
- `packages/engine` es puro: sin IO, sin `Date`, sin `Math.random`, sin mutar inputs.
- Identificadores en inglés; mensajes que puede leer un cliente o el LLM, en español,
  con los valores concretos ("La mother es ATX y el gabinete acepta mATX, ITX.").
- SQL: siempre parámetros, nunca concatenar valores en el texto de la consulta.
  Transacciones con la API del driver, nunca `BEGIN`/`COMMIT` sueltos.

## Datos sensibles

- La columna `Costo` de los CSV de Tiendanube nunca se lee, guarda ni loguea.
- Secretos (tokens, API keys, URLs de base) solo por variables de entorno. Nunca en
  código, tests, fixtures ni logs.
- No commitees CSV reales (`data/` está ignorado).

## Reporte al terminar

Tu reporte debe incluir, en este orden:

1. **Archivos creados y modificados** (lista de rutas).
2. **Desvíos de la tarea**: todo lo que hiciste distinto a lo pedido y por qué. Si no
   hubo, decí "Ninguno".
3. **Preguntas** (`// PREGUNTA:` dejadas).
4. **Salida real** de `pnpm -r build` y de `pnpm -r test -- --reporter=verbose`,
   copiada, no resumida.
5. Lo que la tarea pida además (diffs, contenidos de archivos).

No afirmes que algo existe, se verificó o pasa sin mostrar la evidencia. Si no pudiste
verificar algo, decilo explícitamente.
