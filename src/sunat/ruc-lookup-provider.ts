export type RucLookupResult = {
  ruc: string;
  razonSocial: string;
  direccion: string | null;
  estado: string | null;
  condicion: string | null;
};

/**
 * Source of SUNAT padrón data. Swappable so a different provider (or the
 * official SUNAT endpoint) can replace ApiPeru without touching consumers.
 */
export interface RucLookupProvider {
  lookup(ruc: string): Promise<RucLookupResult>;
}
