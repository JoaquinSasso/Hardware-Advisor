import { type ChatTurn } from '@pcadvisor/shared';

export const INITIAL_SUGGESTIONS = [
  "Quiero jugar Valorant y LoL, tengo $1.000.000",
  "Es para oficina y estudio, hasta $800.000",
  "Para editar video, presupuesto $2.500.000",
];

export const AFTER_SUGGESTIONS = [
  "¿Cuál me conviene más?",
  "Quiero una opción más barata",
  "¿Me sirve para juegos más exigentes?",
  "Prefiero Intel",
];

export function getSuggestions(turns: ChatTurn[], newTurns: ChatTurn[]): string[] {
  const allTurns = [...turns, ...newTurns];
  const hasRecommendation = allTurns.some(
    t => t.role === 'tool' && t.name === 'recommend_builds' && (t.result as any).status === 'ok'
  );
  return hasRecommendation ? AFTER_SUGGESTIONS : INITIAL_SUGGESTIONS;
}
