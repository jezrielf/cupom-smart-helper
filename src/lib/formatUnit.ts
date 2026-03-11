const UNIT_MAP: Record<string, { singular: string; plural: string }> = {
  KG: { singular: "kg", plural: "kg" },
  UN: { singular: "un.", plural: "un." },
  GL: { singular: "galão", plural: "galões" },
  PC: { singular: "peça", plural: "peças" },
  SC: { singular: "saco", plural: "sacos" },
  PT: { singular: "pacote", plural: "pacotes" },
  BR: { singular: "barra", plural: "barras" },
  TP: { singular: "emb.", plural: "emb." },
  FR: { singular: "frasco", plural: "frascos" },
  CJ: { singular: "conjunto", plural: "conjuntos" },
  BD: { singular: "bandeja", plural: "bandejas" },
  GF: { singular: "garrafa", plural: "garrafas" },
  CX: { singular: "caixa", plural: "caixas" },
};

export function formatProductDetail(quantity: number, unit: string | null | undefined, unitPrice: number): string {
  const key = (unit ?? "UN").toUpperCase();
  const priceStr = unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (key === "KG") {
    const qtyStr = quantity.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return `${qtyStr} kg × R$ ${priceStr}/kg`;
  }

  const labels = UNIT_MAP[key] ?? { singular: key.toLowerCase(), plural: key.toLowerCase() };
  const label = quantity === 1 ? labels.singular : labels.plural;
  const qtyStr = Number.isInteger(quantity) ? String(quantity) : quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return `${qtyStr} ${label} × R$ ${priceStr}`;
}
