import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleName } from '@prisma/client';
import { Roles, RolesGuard } from '../auth';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @Roles(
    RoleName.Admin,
    RoleName.Reception,
    RoleName.Mechanic,
    RoleName.Warehouse,
    RoleName.Purchasing,
    RoleName.ReadOnly
  )
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(RoleName.Admin)
  @UseInterceptors(FileInterceptor('image'))
  create(
    @Body() dto: CreateProductDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: 'image/(jpeg|png|webp)',
            skipMagicNumbersValidation: true,
          }),
        ],
        fileIsRequired: false,
      })
    )
    image: Express.Multer.File | undefined
  ) {
    return this.productsService.create(dto, image);
  }

  @Patch(':id')
  @Roles(RoleName.Admin)
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: 'image/(jpeg|png|webp)',
            skipMagicNumbersValidation: true,
          }),
        ],
        fileIsRequired: false,
      })
    )
    image: Express.Multer.File | undefined
  ) {
    return this.productsService.update(id, dto, image);
  }

  @Delete(':id')
  @Roles(RoleName.Admin)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Delete(':id/image')
  @Roles(RoleName.Admin)
  removeImage(@Param('id') id: string) {
    return this.productsService.removeImage(id);
  }
}
