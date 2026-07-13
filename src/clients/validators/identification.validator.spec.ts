import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  validate,
} from 'class-validator';
import { IsValidIdentification } from './identification.validator';

class TestCreateClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  identification?: string;

  @IsOptional()
  @IsString()
  @IsIn(['DNI', 'RUC'])
  identificationType?: string;

  @Validate(IsValidIdentification, ['identification', 'identificationType'])
  readonly identificationValidation?: unknown;
}

describe('IsValidIdentification', () => {
  it('passes for a valid 8-digit DNI', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '12345678';
    dto.identificationType = 'DNI';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid 11-digit RUC', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '12345678901';
    dto.identificationType = 'RUC';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails when DNI does not have 8 digits', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '123';
    dto.identificationType = 'DNI';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsValidIdentification: 'DNI must be exactly 8 digits',
    });
  });

  it('fails when RUC does not have 11 digits', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '12345678';
    dto.identificationType = 'RUC';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsValidIdentification: 'RUC must be exactly 11 digits',
    });
  });

  it('fails when identification is provided but type is missing', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '12345678';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsValidIdentification:
        'identificationType is required when identification is provided',
    });
  });

  it('passes when both identification and type are missing', async () => {
    const dto = new TestCreateClientDto();

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails for an unsupported identification type', async () => {
    const dto = new TestCreateClientDto();
    dto.identification = '12345678';
    dto.identificationType = 'PASSPORT' as 'DNI';

    const errors = await validate(dto);

    expect(errors).toHaveLength(2);
    const identificationError = errors.find(
      (error) => error.property === 'identificationValidation'
    );
    expect(identificationError?.constraints).toMatchObject({
      IsValidIdentification: 'identificationType must be DNI or RUC',
    });
  });
});
