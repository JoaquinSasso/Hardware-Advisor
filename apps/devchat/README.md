# DevChat

Página local para probar el chat del asesor.

## Cómo levantar

1. Asegurate de que la API esté corriendo:
   ```bash
   pnpm --filter @pcadvisor/api dev
   ```
2. Copiá `.env.example` a `.env` en `apps/devchat`:
   ```bash
   cp .env.example .env
   ```
3. Ejecutá el entorno de desarrollo de `devchat`:
   ```bash
   pnpm --filter @pcadvisor/devchat dev
   ```
4. Abrí http://localhost:5173 en tu navegador.
