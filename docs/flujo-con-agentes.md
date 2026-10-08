# Cómo se construyó: dirigir agentes de IA

Este proyecto se desarrolló con una división de roles explícita:

- **Diseño y dirección técnica:** el dueño del proyecto, con un modelo de IA (Claude) como arquitecto. Arquitectura, modelo de datos, contratos, reglas de negocio, prompt del LLM y revisión de todo lo entregado.
- **Implementación:** agentes de Gemini (Flash y Pro) dentro de Google Antigravity, cada uno con una tarea acotada.
- **Verificación:** siempre humana, ejecutando comandos y probando el sistema. Nunca solo leyendo el reporte del agente.

El objetivo no era delegar el pensamiento. Era delegar la escritura del código sin perder la comprensión ni el control de ninguna parte del sistema.

## Reglas permanentes: `AGENTS.md`

En la raíz del repo hay un archivo de reglas que todo agente carga. Lo esencial:

- **Alcance:** tocar solo los archivos de la tarea. Los contratos de `shared` están congelados salvo que la tarea diga lo contrario. Las migraciones existentes no se editan.
- **No decidir arquitectura:** ante un caso no cubierto, dejar un `// PREGUNTA:` y un `it.todo`, y seguir sin inventar.
- **Git:** no crear ramas, no hacer merge, rebase ni push. El historial lo maneja una persona.
- **Tests:** nunca borrarlos, saltearlos ni debilitarlos para que pasen.
- **Código:** TypeScript estricto, validación con zod en todo límite, no ocultar errores de datos, dinero en centavos, SQL parametrizado.
- **Reporte:** archivos tocados, desvíos, preguntas y la salida **real** de compilación y tests. No afirmar nada sin evidencia.

Esta última regla existe por experiencia, como se ve más abajo.

## Anatomía de una tarea

Cada tarea es un bloque autocontenido, porque el agente no ve la conversación de diseño:

1. **Contexto:** qué es el proyecto y qué parte se toca.
2. **Alcance:** archivos exactos que crear o modificar, y qué no tocar.
3. **Contratos exactos:** firmas, tipos y SQL, en código.
4. **Decisiones que el agente no puede tomar.**
5. **Pruebas requeridas:** casos concretos, incluidos los límites (por ejemplo, "una placa de video exactamente igual de larga que el máximo del gabinete entra").
6. **Entrega:** qué archivos mostrar y la salida de `pnpm check`.

Las tareas mecánicas y completamente especificadas van al modelo rápido. Las que tienen sutilezas de dominio, manejo de tiempos, transacciones o cambios que cruzan paquetes van al más capaz. Cuando un cambio de contrato aparece a mitad de camino, se separa en una tarea propia antes de seguir.

## Revisión

Cada entrega se revisa contra la especificación, buscando patrones concretos:

- **Conteos que no cierran:** si se pidieron diez casos y hay ocho tests, falta algo.
- **Desvíos no reportados:** una opción del compilador apagada, una versión de dependencia `*`, un header HTTP que nadie pidió.
- **Errores que se esconden:** `return 0`, valores por defecto ante datos faltantes, `any`.
- **Evidencia ausente:** "todo pasó" sin la salida.

Después la persona verifica por su cuenta: corre `pnpm check`, hace búsquedas con `git grep` sobre patrones prohibidos (`console.`, `innerHTML`) y prueba el sistema en el navegador mirando los logs. Si el arreglo es de una o dos líneas, lo hace a mano, en parte para conocer el código.

## Lo que salió mal

Ser honestos con esto es parte del método:

- **Reportes inventados.** Un agente informó 29 tests en un paquete que tenía 18. Otro describió una "conversación de prueba" con un total que no podía existir en el catálogo. Otro afirmó que la tarea estaba "probada al 100 %" sin haber corrido nada contra la API real. Desde entonces, lo importante lo verifica una persona.
- **Atajos para que compile.** Apagar una regla del compilador en lugar de corregir el error, o usar una versión `*` de una dependencia que no resolvía.
- **Una regla global oculta.** Un prompt global del IDE indicaba crear una rama por tarea. Cada agente trabajó sobre una base distinta y hubo que unificar todo. La solución fue borrar esa regla, prohibir el manejo de git en `AGENTS.md` y hacer commit antes de cada tarea, para poder ver con `git diff` exactamente qué tocó cada agente.
- **Especificaciones ambiguas.** Cuando una especificación decía "y/o", el agente lo escribió literal en un mensaje de error. Cuando decía que cualquier número de cinco dígitos era un precio, el agente lo implementó tal cual y el control marcaba nombres de procesador como precios. En los dos casos, el error estaba en la especificación, no en el agente.

## Lo que funcionó

- **Contratos primero.** Los esquemas compartidos fueron la referencia contra la que se revisó todo.
- **Tests de propiedades y de equivalencia.** Permitieron aceptar cambios grandes, como la optimización del motor, sin leer cada línea.
- **Un catálogo de prueba con trampas.** Cada regla de compatibilidad tiene un caso real en los datos que la ejercita.
- **Una cosa por vez.** Una tarea por commit, una variable por experimento.
- **Correcciones cortas e inmediatas.** Una corrección por revisión, con los problemas ordenados por gravedad.
