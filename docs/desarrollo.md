# Guía de desarrollo

## Requisitos

- **Node 22** (como mínimo 20.6, que es la versión que soporta `--env-file`).
- **pnpm**, en la versión fijada en `package.json` (`packageManager`). La forma más simple de tenerla es con Corepack:

```bash
corepack enable
pnpm -v
```

No hace falta Docker: la base de datos de desarrollo y de tests es PGlite (Postgres en WASM).

## Primeros pasos

```bash
pnpm install
pnpm check        # compila todos los paquetes y corre todos los tests
```

**Usá siempre `pnpm check`, no solo `pnpm test`.** Los paquetes se consumen entre sí por su versión compilada (`dist/`). Si cambiás algo en `db` y testeás `api` sin compilar antes, `api` usa la versión vieja.

pnpm bloquea los scripts de instalación de las dependencias que no fueron aprobadas explícitamente. Si aparece `ERR_PNPM_IGNORED_BUILDS`, corré `pnpm approve-builds`. Aprobá solo los paquetes que necesitan ese script para funcionar (por ejemplo, los que descargan un binario, como esbuild) y commiteá el cambio en la configuración.

## Base local con el catálogo de prueba

El catálogo de prueba está en `packages/db/seed/demo/`. Es un CSV con el formato exacto del export de Tiendanube (con precios y costos ficticios), más las especificaciones y los vínculos.

```bash
pnpm --filter @pcadvisor/db db:migrate
pnpm --filter @pcadvisor/db import:csv --store 900000001 --name "Tienda Demo" --file seed/demo/tiendanube-demo.csv
pnpm --filter @pcadvisor/db seed:components --file seed/demo/components.json
pnpm --filter @pcadvisor/db apply:mappings --store 900000001 --file seed/demo/mappings.json
```

Resultado esperado: 67 variantes importadas y 1 salteada (está fuera de la categoría de componentes), 58 componentes, 66 vínculos (60 confirmados y 6 ignorados) y 55 ítems disponibles para el asesor.

Para cambiar cómo termina la recomendación (agregar al carrito o consultar por WhatsApp):

```bash
pnpm --filter @pcadvisor/db store:config --store 900000001 --checkout whatsapp --whatsapp "+54 9 ..."
```

La base queda en `packages/db/.pglite/`, que está ignorada por git. Si la ruta no existe, la API falla con un mensaje claro: nunca crea una base vacía en silencio.

## Variables de entorno

Copiá `apps/api/.env.example` a `apps/api/.env`:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (8080) |
| `DATABASE_URL` | Postgres de producción. **No la dejes vacía:** si no la usás, borrá o comentá la línea |
| `PGLITE_DIR` | Ruta de la base local (`../../packages/db/.pglite`) |
| `GEMINI_API_KEY` | Se crea en Google AI Studio. **Nunca va en el código ni en un commit** |
| `GEMINI_MODEL` | Modelo principal (un Flash o Flash-Lite del plan gratuito) |
| `GEMINI_FALLBACK_MODEL` | Modelo de respaldo, distinto del principal |
| `ALLOWED_ORIGINS` | Orígenes permitidos por CORS, separados por coma |
| `MAX_USER_MESSAGES` | Límite de mensajes por conversación |

Para verificar que los secretos no se van a subir:

```bash
git check-ignore -v apps/api/.env packages/db/.pglite
```

Cada ruta tiene que mostrar la regla del `.gitignore` que la excluye.

## Correr el sistema

```bash
pnpm --filter @pcadvisor/api dev        # API con recarga automática
pnpm --filter @pcadvisor/devchat dev    # http://localhost:5173
pnpm --filter @pcadvisor/api smoke      # un mensaje real a Gemini, sin interfaz
```

La API escribe un log JSON por línea. Los mensajes más útiles para diagnosticar son:

- `llm_attempt`: cada llamada al modelo, con su duración, su resultado y los *tokens* usados.
- `llm_unavailable`: la causa cuando el cliente recibe "no disponible".
- `money_guard_violation`: montos que el modelo escribió sin que correspondieran a nada real.

## Tests

```bash
pnpm --filter @pcadvisor/engine exec vitest run --reporter=verbose
```

- **shared:** validación de los contratos.
- **db:** migraciones, restricciones de la base, importador e idempotencia, sobre PGlite en memoria.
- **engine:** una tabla de casos por regla de compatibilidad (incluidos los valores límite), perfiles, puntajes, tests sobre el catálogo de prueba y tests de propiedades con fast-check.
- **api:** rutas y orquestador con un LLM simulado, adaptador de Gemini con respuestas grabadas, money guard y limpieza de texto. Ningún test usa la red.
- **advisor-client:** cliente HTTP con `fetch` simulado, estado del chat y textos, más un test que falla si el paquete usa APIs del navegador.

## Convenciones

- El dinero es siempre un entero en centavos. Se formatea con `formatArs` desde `shared`.
- Los identificadores van en inglés. Los mensajes que pueden llegar a un cliente, en español y con los valores concretos.
- Un estado imposible lanza un error. No se saltea ni se reemplaza por un valor por defecto.
- `engine` no hace IO. `advisor-client` no usa APIs del navegador.
- Nunca `innerHTML` con datos de la API o del LLM.
- Los cambios de esquema van en una migración nueva (`NNNN_descripcion.sql`). Las existentes no se editan.
- Antes de cada tarea, commit. Antes de cada push, `pnpm check`.

## Trabajar desde varias máquinas

`git pull` al empezar y `git push` al terminar. Lo que no viaja con el repositorio, y está bien que no viaje: los archivos `.env` y la base `.pglite`. Se recrean con los pasos de esta guía.
