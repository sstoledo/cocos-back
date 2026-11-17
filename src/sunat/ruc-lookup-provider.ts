export type RucLookupResult = {
  ruc: string;
  razonSocial: string;
  direccion: string | null;
  estado: string | null;
  condicion: string | null;
};

/**
 * Nest DI token for the SUNAT padrón source. Lives here (not in the module)
 * to avoid a circular import between the module and the service.
 */
export const RUC_LOOKUP_PROVIDER = 'RucLookupProvider';

/**
 * Source of SUNAT padrón data. Swappable so a different provider (or the
 * official SUNAT endpoint) can replace ApiPeru without touching consumers.
 */
export interface RucLookupProvider {
  lookup(ruc: string): Promise<RucLookupResult>;
}
