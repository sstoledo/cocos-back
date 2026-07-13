import { IsOptional, IsString, Validate, validate } from 'class-validator';
import { IsValidPlate } from './plate.validator';

class TestCreateVehicleDto {
  @IsString()
  @Validate(IsValidPlate)
  plate: string;
}

class TestUpdateVehicleDto {
  @IsOptional()
  @IsString()
  @Validate(IsValidPlate)
  plate?: string;
}

describe('IsValidPlate', () => {
  it('passes for a valid classic plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'ABC123';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid current plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'A1B234';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid motorcycle plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'AB1234';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid special plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'EUA123';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a formatted plate after normalization', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'abc-123';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails for an invalid plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'INVALID';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsValidPlate: 'plate must be a valid Peruvian plate',
    });
  });

  it('fails for a too-short plate', async () => {
    const dto = new TestCreateVehicleDto();
    dto.plate = 'AB123';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      IsValidPlate: 'plate must be a valid Peruvian plate',
    });
  });

  it('fails when the value is not a string', async () => {
    const dto = new TestCreateVehicleDto();
    (dto as unknown as Record<string, unknown>).plate = 12345;

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('plate');
    expect(errors[0].constraints).toMatchObject({
      IsValidPlate: 'plate must be a valid Peruvian plate',
    });
  });

  it('validates optional plates in update DTOs', async () => {
    const dto = new TestUpdateVehicleDto();
    dto.plate = 'XYZ';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('plate');
  });
});
