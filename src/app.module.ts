import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { ClientsModule } from './clients/clients.module';
import { HealthModule } from './health/health.module';
import { LotsModule } from './lots/lots.module';
import { PresentationsModule } from './presentations/presentations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    SuppliersModule,
    PresentationsModule,
    BrandsModule,
    CategoriesModule,
    ClientsModule,
    HealthModule,
    LotsModule,
    StockModule,
    VehiclesModule,
  ],
})
export class AppModule {}
