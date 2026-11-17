import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RucLookupProvider, RucLookupResult } from './ruc-lookup-provider';

const APIPERU_RUC_URL = 'https://api.apiperu.pe/ruc';
const REQUEST_TIMEOUT_MS = 10_000;

type ApiPeruRucResponse = {
  success: boolean;
  code: string;
  message?: string;
  data?: {
    ruc: string;
    nombre_o_razon_social: string;
    estado: string | null;
    condicion: string | null;
    direccion: string | null;
  };
};

@Injectable()
export class ApiPeruRucProvider implements RucLookupProvider {
  constructor(private readonly configService: ConfigService) {}

  async lookup(ruc: string): Promise<RucLookupResult> {
    const token = this.configService.get<string>('APIPERU_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'La consulta RUC no está configurada'
      );
    }

    let response: Response;
    try {
      response = await fetch(APIPERU_RUC_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        // A hung upstream must not block the request indefinitely.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ ruc }),
      });
    } catch {
      throw new BadGatewayException(
        'El servicio de consulta RUC no está disponible'
      );
    }

    const payload = (await response.json()) as ApiPeruRucResponse;

    if (response.ok && payload.success && payload.data) {
      return {
        ruc: payload.data.ruc,
        razonSocial: payload.data.nombre_o_razon_social,
        direccion: payload.data.direccion,
        estado: payload.data.estado,
        condicion: payload.data.condicion,
      };
    }

    if (response.status === 404 || payload.code === 'document_not_found') {
      throw new NotFoundException('RUC no encontrado en el padrón de SUNAT');
    }

    if (response.status === 400 || payload.code === 'invalid_input') {
      throw new BadRequestException('El RUC es incorrecto');
    }

    throw new BadGatewayException(
      'El servicio de consulta RUC no está disponible'
    );
  }
}
