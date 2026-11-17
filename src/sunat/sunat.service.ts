import { Inject, Injectable } from '@nestjs/common';
import type { RucLookupProvider, RucLookupResult } from './ruc-lookup-provider';
import { RUC_LOOKUP_PROVIDER } from './ruc-lookup-provider';

@Injectable()
export class SunatService {
  constructor(
    @Inject(RUC_LOOKUP_PROVIDER)
    private readonly rucLookupProvider: RucLookupProvider
  ) {}

  lookupRuc(ruc: string): Promise<RucLookupResult> {
    return this.rucLookupProvider.lookup(ruc);
  }
}
