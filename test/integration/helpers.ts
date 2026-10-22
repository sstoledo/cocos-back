// Shared helpers for integration suites. Complete cleanup via raw TRUNCATE:
// faster and stricter than per-model deleteMany chains, and CASCADE keeps
// referential integrity regardless of the order the suite creates rows in.
// Table names come from the @@map declarations in prisma/schema.prisma
// (enum tables excluded: TRUNCATE on pre-populated enum tables would break
// later tests and is unnecessary — the enum rows are static).
import { PrismaService } from '../../src/prisma/prisma.service';

const ALL_TABLES = [
  'stock_movements',
  'sale_products',
  'sales',
  'sale_number_sequences',
  'work_order_payments',
  'work_order_consumption_events',
  'work_orders',
  'work_order_services',
  'work_order_number_sequences',
  'cash_closings',
  'purchase_order_lines',
  'purchase_orders',
  'purchase_order_number_sequences',
  'notifications',
  'lot_items',
  'lots',
  'service_products',
  'services',
  'vehicles',
  'clients',
  'presentations',
  'categories',
  'brands',
  'products',
  'employees',
  'branches',
  'suppliers',
  'User',
];

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`
  );
}
