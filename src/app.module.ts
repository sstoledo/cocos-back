import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CashClosingsModule } from './cash-closings/cash-closings.module';
import { CategoriesModule } from './categories/categories.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthModule } from './health/health.module';
import { LotsModule } from './lots/lots.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PresentationsModule } from './presentations/presentations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProformasModule } from './proformas/proformas.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { SalesModule } from './sales/sales.module';
import { ServicesModule } from './services/services.module';
import { StockModule } from './stock';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

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
    ServicesModule,
    VehiclesModule,
    WorkOrdersModule,
    SalesModule,
    ProformasModule,
    PurchaseOrdersModule,
    ReceiptsModule,
    NotificationsModule,
    DashboardModule,
    CashClosingsModule,
    EmployeesModule,
  ],
})
export class AppModule {}
