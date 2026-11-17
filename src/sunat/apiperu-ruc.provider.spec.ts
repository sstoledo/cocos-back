import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiPeruRucProvider } from './apiperu-ruc.provider';

const buildProvider = (token: string | undefined) => {
  const configService = {
    get: jest.fn().mockReturnValue(token),
  } as unknown as ConfigService;
  return new ApiPeruRucProvider(configService);
};

const foundResponse = {
  success: true,
  code: 'found',
  retryable: false,
  data: {
    ruc: '20131312955',
    nombre_o_razon_social: 'SUPERINTENDENCIA NACIONAL...',
    estado: 'ACTIVO',
    condicion: 'HABIDO',
    direccion: 'AV. GARCILASO DE LA VEGA NRO. 1472',
  },
};

describe('ApiPeruRucProvider', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('maps the ApiPeru response into the normalized RucLookup shape', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(foundResponse),
    });

    const provider = buildProvider('token-123');
    await expect(provider.lookup('20131312955')).resolves.toEqual({
      ruc: '20131312955',
      razonSocial: 'SUPERINTENDENCIA NACIONAL...',
      direccion: 'AV. GARCILASO DE LA VEGA NRO. 1472',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.apiperu.pe/ruc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
        body: JSON.stringify({ ruc: '20131312955' }),
      })
    );
  });

  it('throws ServiceUnavailable when no token is configured', async () => {
    const provider = buildProvider(undefined);

    await expect(provider.lookup('20131312955')).rejects.toThrow(
      ServiceUnavailableException
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws NotFound when the RUC is not in the padrón', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          success: false,
          code: 'document_not_found',
          message: 'El RUC no existe',
        }),
    });

    const provider = buildProvider('token-123');
    await expect(provider.lookup('20131312955')).rejects.toThrow(
      NotFoundException
    );
  });

  it('throws BadRequest when the provider rejects the input', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          success: false,
          code: 'invalid_input',
          message: 'El RUC es incorrecto',
        }),
    });

    const provider = buildProvider('token-123');
    await expect(provider.lookup('20131312955')).rejects.toThrow(
      BadRequestException
    );
  });

  it('throws BadGateway when the upstream is unavailable', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () =>
        Promise.resolve({
          success: false,
          code: 'upstream_unavailable',
          retryable: true,
          message: 'Servicio no disponible',
        }),
    });

    const provider = buildProvider('token-123');
    await expect(provider.lookup('20131312955')).rejects.toThrow(
      BadGatewayException
    );
  });

  it('throws BadGateway when the network request fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = buildProvider('token-123');
    await expect(provider.lookup('20131312955')).rejects.toThrow(
      BadGatewayException
    );
  });
});
