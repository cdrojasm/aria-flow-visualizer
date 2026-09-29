// Líneas finas gris oscuro arriba y abajo; reemplazan el borde de las tarjetas.
const TOP_LINE =
  "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-text-secondary before:opacity-40 before:pointer-events-none";
const BOTTOM_LINE =
  "after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-text-secondary after:opacity-40 after:pointer-events-none";

export const EDGE_LINES = `relative ${TOP_LINE} ${BOTTOM_LINE}`;
export const TOP_EDGE_LINE = `relative ${TOP_LINE}`;
