export function formatArs(cents: number): string {
  const pesetas = Math.round(cents / 100);
  return '$ ' + pesetas.toLocaleString('es-AR');
}
