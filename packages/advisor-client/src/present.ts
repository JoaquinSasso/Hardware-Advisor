import type { Build } from '@pcadvisor/shared';
import { formatArs } from '@pcadvisor/shared';
import type { ClientError } from './api.js';

export function tierLabel(build: Build, totalBuilds: number): string | null {
  if (totalBuilds === 1) return null;
  switch (build.tier) {
    case 'budget': return 'Económica';
    case 'balanced': return 'Equilibrada';
    case 'performance': return 'Rendimiento';
  }
}

export function errorText(error: ClientError): string {
  switch (error) {
    case 'invalid_request':
      return 'No pude procesar tu mensaje. Probá escribirlo de otra forma.';
    case 'store_not_found':
      return 'El asesor no está disponible en esta tienda.';
    case 'conversation_limit':
      return 'Llegaste al límite de mensajes de esta conversación. Si querés seguir, escribinos por WhatsApp.';
    case 'llm_unavailable':
      return 'El asesor no está disponible en este momento. Probá de nuevo en unos minutos.';
    case 'internal':
      return 'Ocurrió un error. Probá de nuevo.';
    case 'network':
      return 'No hay conexión con el asesor. Revisá tu conexión e intentá de nuevo.';
  }
}

export function buildReference(recommendationId: string, build: Build): string {
  return `${recommendationId.slice(0, 8)}-${build.tier}`;
}

export function whatsappUrl(phone: string, build: Build, recommendationId: string): string {
  const digits = phone.replace(/\D/g, '');
  const lines = [
    'Hola! Quiero consultar por este armado de PC:',
    ...build.items.map(item => `- ${item.name}${item.qty > 1 ? ` x${item.qty}` : ''}`),
    `Total: ${formatArs(build.totalCents)}`,
    `Código de armado: ${buildReference(recommendationId, build)}`
  ];
  const text = lines.join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
