# PC Advisor Monorepo

Asesor de armado de PC para tiendas Tiendanube. Monorepo TypeScript con contratos compartidos, motor determinístico y aplicaciones.

## Estructura

- `packages/shared`: Contratos compartidos (tipos y esquemas Zod).
- `packages/engine`: Motor determinístico de compatibilidad y armado de PCs.
- `apps/api`: Servidor API / backend.
- `apps/widget`: Widget de chat para clientes de Tiendanube.
- `apps/admin`: Panel de administración.

## Comandos

- `pnpm install`: Instala las dependencias del proyecto.
- `pnpm -r build`: Compila los paquetes del monorepo.
- `pnpm -r test`: Ejecuta las pruebas automatizadas.
