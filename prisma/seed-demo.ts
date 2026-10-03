import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed ids make the seed idempotent: createMany + skipDuplicates is a no-op
// on re-runs because every row already exists with the same primary key.
// Relation ids are still resolved by unique key after each insert, because a
// row with the same unique name may already exist with a different id.
const FIXED_ID = {
  suppliers: {
    repuestosLima: 'clseedsupplier0000000001',
    autoPartesSur: 'clseedsupplier0000000002',
    distribuidoraMotor: 'clseedsupplier000000003',
  },
  clients: {
    carlos: 'clseedclient000000000001',
    lucia: 'clseedclient000000000002',
    jorge: 'clseedclient000000000003',
    ana: 'clseedclient000000000004',
  },
  lots: {
    lot1: 'clseedlot000000000000001',
    lot2: 'clseedlot000000000000002',
    lot3: 'clseedlot000000000000003',
  },
} as const;

const productId = (n: number) =>
  `clseedproduct${String(n).padStart(9, '0')}`;
const serviceId = (n: number) =>
  `clseedservice${String(n).padStart(9, '0')}`;
const vehicleId = (n: number) =>
  `clseedvehicle${String(n).padStart(9, '0')}`;
const lotItemId = (n: number) =>
  `clseedlotitem${String(n).padStart(9, '0')}`;

const BRAND_NAMES = ['Bosch', 'NGK', 'Mann Filter', 'Shell', 'Castrol', 'Brembo'];
const CATEGORY_NAMES = [
  'Filtros',
  'Aceites',
  'Frenos',
  'Suspensión',
  'Electricidad',
  'Motor',
];
const PRESENTATION_NAMES = ['Unidad', 'Litro', 'Galón', 'Caja x10', 'Par'];

async function main() {
  await prisma.brand.createMany({
    data: BRAND_NAMES.map((name, i) => ({
      id: `clseedbrand${String(i + 1).padStart(10, '0')}`,
      name,
    })),
    skipDuplicates: true,
  });
  const brands = await prisma.brand.findMany({
    where: { name: { in: BRAND_NAMES } },
  });
  const brandIdByName = new Map(brands.map((b) => [b.name, b.id]));

  await prisma.category.createMany({
    data: CATEGORY_NAMES.map((name, i) => ({
      id: `clseedcategory${String(i + 1).padStart(10, '0')}`,
      name,
    })),
    skipDuplicates: true,
  });
  const categories = await prisma.category.findMany({
    where: { name: { in: CATEGORY_NAMES } },
  });
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  await prisma.presentation.createMany({
    data: PRESENTATION_NAMES.map((name, i) => ({
      id: `clseedpresentation${String(i + 1).padStart(7, '0')}`,
      name,
    })),
    skipDuplicates: true,
  });
  const presentations = await prisma.presentation.findMany({
    where: { name: { in: PRESENTATION_NAMES } },
  });
  const presentationIdByName = new Map(
    presentations.map((p) => [p.name, p.id]),
  );

  await prisma.supplier.createMany({
    data: [
      {
        id: FIXED_ID.suppliers.repuestosLima,
        name: 'Repuestos Lima SAC',
        phone: '+51 1 456 7890',
        email: 'ventas@repuestoslima.pe',
        address: 'Av. Argentina 1234, Lima',
      },
      {
        id: FIXED_ID.suppliers.autoPartesSur,
        name: 'AutoPartes del Sur',
        phone: '+51 54 234 567',
        email: 'contacto@autopartessur.pe',
        address: 'Av. Ejército 456, Arequipa',
      },
      {
        id: FIXED_ID.suppliers.distribuidoraMotor,
        name: 'Distribuidora Motor',
        phone: '+51 1 789 0123',
        email: 'pedidos@distrimotor.pe',
        address: 'Jr. Los Olivos 789, Callao',
      },
    ],
    skipDuplicates: true,
  });
  const suppliers = await prisma.supplier.findMany({
    where: {
      name: {
        in: [
          'Repuestos Lima SAC',
          'AutoPartes del Sur',
          'Distribuidora Motor',
        ],
      },
    },
  });
  const supplierIdByName = new Map(suppliers.map((s) => [s.name, s.id]));

  const product = (
    n: number,
    code: string,
    name: string,
    price: string,
    barcode: string,
    presentationName: string,
    brandName: string,
    categoryName: string,
    description?: string,
  ) => ({
    id: productId(n),
    code,
    name,
    description,
    price,
    barcode,
    presentationId: presentationIdByName.get(presentationName) as string,
    brandId: brandIdByName.get(brandName) as string,
    categoryId: categoryIdByName.get(categoryName) as string,
  });

  await prisma.product.createMany({
    data: [
      product(
        1,
        'FIL-001',
        'Filtro de aceite Bosch',
        '45.00',
        '7750182000011',
        'Unidad',
        'Bosch',
        'Filtros',
        'Filtro de aceite para motor a gasolina',
      ),
      product(
        2,
        'FIL-002',
        'Filtro de aire Mann Filter',
        '60.00',
        '7750182000028',
        'Unidad',
        'Mann Filter',
        'Filtros',
        'Filtro de aire de alta eficiencia',
      ),
      product(
        3,
        'FIL-003',
        'Filtro de combustible Mann Filter',
        '75.00',
        '7750182000035',
        'Unidad',
        'Mann Filter',
        'Filtros',
      ),
      product(
        4,
        'ACE-001',
        'Aceite Shell Helix Ultra 5W-40',
        '180.00',
        '7750182000042',
        'Galón',
        'Shell',
        'Aceites',
        'Aceite sintético para motor',
      ),
      product(
        5,
        'ACE-002',
        'Aceite Castrol Magnatec 10W-40',
        '55.00',
        '7750182000059',
        'Litro',
        'Castrol',
        'Aceites',
      ),
      product(
        6,
        'ACE-003',
        'Aceite Castrol GTX 20W-50',
        '140.00',
        '7750182000066',
        'Galón',
        'Castrol',
        'Aceites',
      ),
      product(
        7,
        'FRE-001',
        'Pastillas de freno Brembo',
        '220.00',
        '7750182000073',
        'Par',
        'Brembo',
        'Frenos',
        'Juego de pastillas delanteras',
      ),
      product(
        8,
        'FRE-002',
        'Discos de freno Brembo',
        '350.00',
        '7750182000080',
        'Par',
        'Brembo',
        'Frenos',
      ),
      product(
        9,
        'SUS-001',
        'Amortiguador delantero Bosch',
        '280.00',
        '7750182000097',
        'Unidad',
        'Bosch',
        'Suspensión',
      ),
      product(
        10,
        'ELE-001',
        'Bujía NGK Iridium',
        '150.00',
        '7750182000103',
        'Caja x10',
        'NGK',
        'Electricidad',
      ),
      product(
        11,
        'ELE-002',
        'Cables de bujía NGK',
        '90.00',
        '7750182000110',
        'Unidad',
        'NGK',
        'Electricidad',
      ),
      product(
        12,
        'MOT-001',
        'Correa de distribución Bosch',
        '120.00',
        '7750182000127',
        'Unidad',
        'Bosch',
        'Motor',
      ),
    ],
    skipDuplicates: true,
  });
  const products = await prisma.product.findMany({
    where: {
      code: {
        in: [
          'FIL-001',
          'FIL-002',
          'FIL-003',
          'ACE-001',
          'ACE-002',
          'ACE-003',
          'FRE-001',
          'FRE-002',
          'SUS-001',
          'ELE-001',
          'ELE-002',
          'MOT-001',
        ],
      },
    },
  });
  const productIdByCode = new Map(products.map((p) => [p.code, p.id]));

  await prisma.service.createMany({
    data: [
      {
        id: serviceId(1),
        code: 'SRV-001',
        name: 'Cambio de aceite',
        description: 'Cambio de aceite y filtro de aceite',
        price: '80.00',
        estimatedDuration: 45,
      },
      {
        id: serviceId(2),
        code: 'SRV-002',
        name: 'Alineación',
        price: '100.00',
        estimatedDuration: 60,
      },
      {
        id: serviceId(3),
        code: 'SRV-003',
        name: 'Balanceo',
        price: '60.00',
        estimatedDuration: 40,
      },
      {
        id: serviceId(4),
        code: 'SRV-004',
        name: 'Cambio de pastillas de freno',
        price: '150.00',
        estimatedDuration: 90,
      },
      {
        id: serviceId(5),
        code: 'SRV-005',
        name: 'Diagnóstico electrónico',
        description: 'Escaneo computarizado de sistemas del vehículo',
        price: '120.00',
        estimatedDuration: 60,
      },
      {
        id: serviceId(6),
        code: 'SRV-006',
        name: 'Revisión de suspensión',
        price: '90.00',
        estimatedDuration: 60,
      },
      {
        id: serviceId(7),
        code: 'SRV-007',
        name: 'Cambio de bujías',
        price: '110.00',
        estimatedDuration: 50,
      },
      {
        id: serviceId(8),
        code: 'SRV-008',
        name: 'Mantenimiento general',
        description: 'Mantenimiento preventivo completo',
        price: '250.00',
        estimatedDuration: 180,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.client.createMany({
    data: [
      {
        id: FIXED_ID.clients.carlos,
        name: 'Carlos Mendoza',
        phone: '+51 987 654 321',
        email: 'carlos.mendoza@example.com',
        address: 'Av. Los Pinos 123, Lima',
        identification: '45678901',
        identificationType: 'DNI',
      },
      {
        id: FIXED_ID.clients.lucia,
        name: 'Lucía Ramírez',
        phone: '+51 912 345 678',
        email: 'lucia.ramirez@example.com',
        address: 'Jr. Las Flores 456, Lima',
        identification: '41234567',
        identificationType: 'DNI',
      },
      {
        id: FIXED_ID.clients.jorge,
        name: 'Jorge Castillo',
        phone: '+51 998 765 432',
        email: 'jorge.castillo@example.com',
        address: 'Av. El Sol 789, Cusco',
        identification: '39876543',
        identificationType: 'DNI',
      },
      {
        id: FIXED_ID.clients.ana,
        name: 'Ana Torres',
        phone: '+51 945 678 912',
        email: 'ana.torres@example.com',
        address: 'Calle Luna 321, Trujillo',
        identification: '42345678',
        identificationType: 'DNI',
      },
    ],
    skipDuplicates: true,
  });
  const clients = await prisma.client.findMany({
    where: {
      identification: { in: ['45678901', '41234567', '39876543', '42345678'] },
    },
  });
  const clientIdByIdentification = new Map(
    clients.map((c) => [c.identification, c.id]),
  );

  const vehicle = (
    n: number,
    plate: string,
    brand: string,
    model: string,
    year: number,
    color: string,
    clientIdentification: string,
  ) => ({
    id: vehicleId(n),
    plate,
    brand,
    model,
    year,
    color,
    clientId: clientIdByIdentification.get(clientIdentification) as string,
  });

  await prisma.vehicle.createMany({
    data: [
      vehicle(1, 'ABC-123', 'Toyota', 'Corolla', 2019, 'Blanco', '45678901'),
      vehicle(2, 'DEF-456', 'Nissan', 'Versa', 2021, 'Gris', '45678901'),
      vehicle(3, 'GHI-789', 'Honda', 'Civic', 2020, 'Negro', '41234567'),
      vehicle(4, 'JKL-012', 'Hyundai', 'Elantra', 2018, 'Rojo', '39876543'),
      vehicle(5, 'MNO-345', 'Kia', 'Rio', 2022, 'Azul', '39876543'),
      vehicle(6, 'PQR-678', 'Mazda', 'Mazda 3', 2021, 'Plata', '42345678'),
    ],
    skipDuplicates: true,
  });

  await prisma.lot.createMany({
    data: [
      {
        id: FIXED_ID.lots.lot1,
        lotNumber: 'LOTE-2026-001',
        supplierId: supplierIdByName.get('Repuestos Lima SAC') as string,
        notes: 'Reposición mensual de filtros y bujías',
      },
      {
        id: FIXED_ID.lots.lot2,
        lotNumber: 'LOTE-2026-002',
        supplierId: supplierIdByName.get('AutoPartes del Sur') as string,
        notes: 'Stock de aceites y frenos',
      },
      {
        id: FIXED_ID.lots.lot3,
        lotNumber: 'LOTE-2026-003',
        supplierId: supplierIdByName.get('Distribuidora Motor') as string,
        notes: 'Repuestos varios de motor y suspensión',
      },
    ],
    skipDuplicates: true,
  });
  const lots = await prisma.lot.findMany({
    where: {
      lotNumber: { in: ['LOTE-2026-001', 'LOTE-2026-002', 'LOTE-2026-003'] },
    },
  });
  const lotIdByNumber = new Map(lots.map((l) => [l.lotNumber, l.id]));

  const lotItem = (
    n: number,
    lotNumber: string,
    productCode: string,
    quantity: number,
    costPrice: string,
    expirationDate: string,
  ) => ({
    id: lotItemId(n),
    lotId: lotIdByNumber.get(lotNumber) as string,
    productId: productIdByCode.get(productCode) as string,
    quantity,
    remainingQuantity: quantity,
    costPrice,
    expirationDate: new Date(expirationDate),
  });

  await prisma.lotItem.createMany({
    data: [
      lotItem(1, 'LOTE-2026-001', 'FIL-001', 50, '28.00', '2028-06-01'),
      lotItem(2, 'LOTE-2026-001', 'FIL-002', 40, '38.00', '2028-03-15'),
      lotItem(3, 'LOTE-2026-001', 'FIL-003', 30, '47.00', '2028-03-15'),
      lotItem(4, 'LOTE-2026-001', 'ELE-001', 20, '95.00', '2027-12-01'),
      lotItem(5, 'LOTE-2026-002', 'ACE-001', 25, '120.00', '2028-09-30'),
      lotItem(6, 'LOTE-2026-002', 'ACE-002', 40, '35.00', '2028-09-30'),
      lotItem(7, 'LOTE-2026-002', 'ACE-003', 25, '92.00', '2028-09-30'),
      lotItem(8, 'LOTE-2026-002', 'FRE-001', 20, '150.00', '2027-10-01'),
      lotItem(9, 'LOTE-2026-003', 'FRE-002', 15, '240.00', '2027-10-01'),
      lotItem(10, 'LOTE-2026-003', 'SUS-001', 15, '190.00', '2028-01-20'),
      lotItem(11, 'LOTE-2026-003', 'ELE-002', 25, '55.00', '2028-04-10'),
      lotItem(12, 'LOTE-2026-003', 'MOT-001', 20, '78.00', '2028-07-01'),
    ],
    skipDuplicates: true,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
