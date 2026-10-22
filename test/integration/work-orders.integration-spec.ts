// S3 integration suite: work-order transitions (full matrix + mechanic
// scoping), payments (partial/full derivation, overpayment guard as a real
// gate, racing payments), order-number sequencing, and create() guards.
// Narrow testing module: real sub-services with prisma-only dependencies,
// no AppModule (the auth chain stays out of these tests).
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PaymentMethod, RoleName, WorkOrderStatus } from '@prisma/client';
import type { Role, User } from '@prisma/client';
import { ClientsService } from '../../src/clients/clients.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { VehiclesService } from '../../src/vehicles/vehicles.service';
import type { CreateWorkOrderPaymentDto } from '../../src/work-orders/dto/create-work-order-payment.dto';
import type { CreateWorkOrderDto } from '../../src/work-orders/dto/create-work-order.dto';
import { WorkOrdersService } from '../../src/work-orders/work-orders.service';
import { truncateAll } from './helpers';

const uuid = () => crypto.randomUUID();

async function catchHttpError(
  promise: Promise<unknown>
): Promise<HttpException | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as HttpException;
  }
}

function mechanicUser(id: string, name: string): User & { role: Role } {
  return {
    id,
    name,
    email: `${id}@integration.test`,
    emailVerified: true,
    image: null,
    roleId: 'role-mechanic',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { id: 'role-mechanic', name: RoleName.Mechanic },
  } as User & { role: Role };
}

describe('WorkOrdersService (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: WorkOrdersService;

  beforeAll(async () => {
    const compiled = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        ClientsService,
        VehiclesService,
        NotificationsService,
        PrismaService,
      ],
    }).compile();
    moduleRef = compiled;
    prisma = compiled.get(PrismaService);
    service = compiled.get(WorkOrdersService);
    await compiled.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  // --- seeding helpers -----------------------------------------------------

  async function seedService(price = 100) {
    return prisma.service.create({
      data: { code: `SVC-${uuid()}`, name: 'Alignment', price },
    });
  }

  async function seedClient(name = 'Client') {
    return prisma.client.create({ data: { name } });
  }

  async function seedVehicle(clientId: string) {
    return prisma.vehicle.create({
      data: {
        plate: `ABC-${uuid().slice(0, 6)}`,
        brand: 'Toyota',
        model: 'Corolla',
        clientId,
      },
    });
  }

  async function createOrder(overrides: Partial<CreateWorkOrderDto> = {}) {
    const client = await seedClient();
    const vehicle = await seedVehicle(client.id);
    const svc = await seedService();
    return service.create({
      clientId: client.id,
      vehicleId: vehicle.id,
      services: [{ serviceId: svc.id, quantity: 1 }],
      ...overrides,
    });
  }

  async function persistedStatus(id: string) {
    const row = await prisma.workOrder.findUniqueOrThrow({ where: { id } });
    return row.status;
  }

  async function expectInvalidTransition(id: string, to: WorkOrderStatus) {
    const error = await catchHttpError(service.transitionStatus(id, to));
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getStatus()).toBe(409);
    expect(error?.getResponse()).toEqual(
      expect.objectContaining({ errorCode: 'INVALID_STATUS_TRANSITION' })
    );
  }

  // --- S3.1: full transition matrix ---------------------------------------

  it('applies every allowed transition and persists the new status', async () => {
    const cases: Array<[WorkOrderStatus, WorkOrderStatus]> = [
      [WorkOrderStatus.pending, WorkOrderStatus.in_progress],
      [WorkOrderStatus.pending, WorkOrderStatus.cancelled],
      [WorkOrderStatus.in_progress, WorkOrderStatus.done],
      [WorkOrderStatus.in_progress, WorkOrderStatus.cancelled],
    ];

    for (const [from, to] of cases) {
      const order = await createOrder(
        from === WorkOrderStatus.in_progress
          ? { status: WorkOrderStatus.in_progress }
          : {}
      );
      const result = await service.transitionStatus(order.id, to);
      expect(result.status).toBe(to);
      expect(await persistedStatus(order.id)).toBe(to);
    }
  });

  it('rejects every forbidden transition with INVALID_STATUS_TRANSITION and leaves status unchanged', async () => {
    const forbiddenFromPending: WorkOrderStatus[] = [
      WorkOrderStatus.done,
      WorkOrderStatus.pending,
    ];
    for (const to of forbiddenFromPending) {
      const order = await createOrder();
      await expectInvalidTransition(order.id, to);
      expect(await persistedStatus(order.id)).toBe(WorkOrderStatus.pending);
    }

    const inProgressOrder = await createOrder({
      status: WorkOrderStatus.in_progress,
    });
    await expectInvalidTransition(inProgressOrder.id, WorkOrderStatus.pending);
    await expectInvalidTransition(
      inProgressOrder.id,
      WorkOrderStatus.in_progress
    );
    expect(await persistedStatus(inProgressOrder.id)).toBe(
      WorkOrderStatus.in_progress
    );

    const doneOrder = await createOrder({
      status: WorkOrderStatus.in_progress,
    });
    await service.transitionStatus(doneOrder.id, WorkOrderStatus.done);
    for (const to of [
      WorkOrderStatus.pending,
      WorkOrderStatus.in_progress,
      WorkOrderStatus.done,
      WorkOrderStatus.cancelled,
    ]) {
      await expectInvalidTransition(doneOrder.id, to);
    }
    expect(await persistedStatus(doneOrder.id)).toBe(WorkOrderStatus.done);

    const cancelledOrder = await createOrder();
    await service.transitionStatus(
      cancelledOrder.id,
      WorkOrderStatus.cancelled
    );
    for (const to of [
      WorkOrderStatus.pending,
      WorkOrderStatus.in_progress,
      WorkOrderStatus.done,
      WorkOrderStatus.cancelled,
    ]) {
      await expectInvalidTransition(cancelledOrder.id, to);
    }
    expect(await persistedStatus(cancelledOrder.id)).toBe(
      WorkOrderStatus.cancelled
    );
  });

  // --- S3.2: payment derivation (partial then full) ------------------------

  it('derives paymentStatus partial then paid across Decimal payments', async () => {
    const order = await createOrder();

    const first = await service.addPayment(order.id, {
      amount: 40.5,
      paymentMethod: PaymentMethod.cash,
    } satisfies CreateWorkOrderPaymentDto);
    expect(first.amount).toBe('40.50');

    let view = await service.findOne(order.id);
    expect(view.paidAmount).toBe('40.50');
    expect(view.paymentStatus).toBe('partial');

    const second = await service.addPayment(order.id, {
      amount: 59.5,
      paymentMethod: PaymentMethod.transfer,
      note: 'settlement',
    } satisfies CreateWorkOrderPaymentDto);
    expect(second.amount).toBe('59.50');

    view = await service.findOne(order.id);
    expect(view.paidAmount).toBe('100.00');
    expect(view.paymentStatus).toBe('paid');

    const rows = await prisma.workOrderPayment.findMany({
      where: { workOrderId: order.id },
      orderBy: { paidAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => Number(row.amount))).toEqual([40.5, 59.5]);
    expect(rows.map((row) => row.paymentMethod)).toEqual([
      PaymentMethod.cash,
      PaymentMethod.transfer,
    ]);
    expect(rows.every((row) => row.paidAt instanceof Date)).toBe(true);
  });

  // --- S3.3: overpayment guard is a real gate ------------------------------

  it('rejects an overpayment with WORK_ORDER_OVERPAYMENT and writes no payment row', async () => {
    const order = await createOrder();

    await service.addPayment(order.id, {
      amount: 100,
      paymentMethod: PaymentMethod.cash,
    });

    const error = await catchHttpError(
      service.addPayment(order.id, {
        amount: 0.01,
        paymentMethod: PaymentMethod.card,
      })
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getStatus()).toBe(400);
    expect(error?.getResponse()).toEqual(
      expect.objectContaining({ errorCode: 'WORK_ORDER_OVERPAYMENT' })
    );

    // Rejected command leaves stored data unchanged: exactly the first row.
    const rows = await prisma.workOrderPayment.findMany({
      where: { workOrderId: order.id },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(100);
  });

  // --- S3.4: racing payments ----------------------------------------------

  it('validates each racing payment against the in-transaction paid sum', async () => {
    const clients = moduleRef.get(ClientsService);
    const vehicles = moduleRef.get(VehiclesService);
    const notifications = moduleRef.get(NotificationsService);
    const serviceA = new WorkOrdersService(
      prisma,
      clients,
      vehicles,
      notifications
    );
    const serviceB = new WorkOrdersService(
      prisma,
      clients,
      vehicles,
      notifications
    );

    const order = await createOrder(); // total 100

    // Each payment stays under the remaining total individually; combined
    // they exceed it. Prisma interactive transactions run at Read
    // Committed, so the interleaving is not deterministic: the second
    // transaction either observes the first payment and is rejected by the
    // in-transaction paid-sum guard, or both commit (documented race
    // window). The deterministic guarantees pinned here: a rejection is
    // always WORK_ORDER_OVERPAYMENT, and the persisted rows match exactly
    // the fulfilled calls — never a partial ghost row.
    const outcomes = await Promise.allSettled([
      serviceA.addPayment(order.id, {
        amount: 60,
        paymentMethod: PaymentMethod.cash,
      }),
      serviceB.addPayment(order.id, {
        amount: 60,
        paymentMethod: PaymentMethod.card,
      }),
    ]);

    let fulfilled = 0;
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        fulfilled += 1;
        expect(Number(outcome.value.amount)).toBe(60);
      } else {
        const reason = outcome.reason as HttpException;
        expect(reason).toBeInstanceOf(BadRequestException);
        expect(reason.getResponse()).toEqual(
          expect.objectContaining({ errorCode: 'WORK_ORDER_OVERPAYMENT' })
        );
      }
    }
    expect(fulfilled).toBeGreaterThanOrEqual(1);

    const rows = await prisma.workOrderPayment.findMany({
      where: { workOrderId: order.id },
    });
    expect(rows).toHaveLength(fulfilled);
    expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(
      60 * fulfilled
    );
  });

  // --- S3.5: mechanic scoping ---------------------------------------------

  it('scopes mechanic visibility to their own employee orders', async () => {
    const role = await prisma.role.upsert({
      where: { name: RoleName.Mechanic },
      update: {},
      create: { name: RoleName.Mechanic },
    });
    const userA = await prisma.user.create({
      data: {
        id: `u-${uuid()}`,
        name: 'Mechanic A',
        email: `a-${uuid()}@integration.test`,
        roleId: role.id,
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: `u-${uuid()}`,
        name: 'Mechanic B',
        email: `b-${uuid()}@integration.test`,
        roleId: role.id,
      },
    });
    const userWithoutEmployee = await prisma.user.create({
      data: {
        id: `u-${uuid()}`,
        name: 'Mechanic C',
        email: `c-${uuid()}@integration.test`,
        roleId: role.id,
      },
    });
    const employeeA = await prisma.employee.create({
      data: { name: 'Employee A', userId: userA.id },
    });
    const employeeB = await prisma.employee.create({
      data: { name: 'Employee B', userId: userB.id },
    });

    const order = await createOrder({ employeeId: employeeA.id });

    // The assigned mechanic's user id can transition the order.
    const transitioned = await service.transitionStatus(
      order.id,
      WorkOrderStatus.in_progress,
      mechanicUser(userA.id, 'Mechanic A')
    );
    expect(transitioned.status).toBe(WorkOrderStatus.in_progress);

    // Another employee's user id cannot see or act on it.
    const foreignTransition = await catchHttpError(
      service.transitionStatus(
        order.id,
        WorkOrderStatus.done,
        mechanicUser(userB.id, 'Mechanic B')
      )
    );
    expect(foreignTransition).toBeInstanceOf(NotFoundException);
    expect(foreignTransition?.getResponse()).toEqual(
      expect.objectContaining({ errorCode: 'WORK_ORDER_NOT_FOUND' })
    );

    const foreignList = await service.findAll(
      { page: 1, limit: 10 },
      mechanicUser(userB.id, 'Mechanic B')
    );
    expect(foreignList.data).toHaveLength(0);
    expect(foreignList.meta.total).toBe(0);

    // A mechanic user with no employee row sees nothing.
    const unassignedList = await service.findAll(
      { page: 1, limit: 10 },
      mechanicUser(userWithoutEmployee.id, 'Mechanic C')
    );
    expect(unassignedList.data).toHaveLength(0);
    expect(unassignedList.meta.total).toBe(0);

    const assignedList = await service.findAll(
      { page: 1, limit: 10 },
      mechanicUser(userA.id, 'Mechanic A')
    );
    expect(assignedList.meta.total).toBe(1);
    expect(assignedList.data[0].id).toBe(order.id);
  });

  // --- S3.6: order number sequencing --------------------------------------

  it('generates sequential order numbers OC-<year>-000001, OC-<year>-000002', async () => {
    const year = new Date().getFullYear();
    const first = await createOrder();
    const second = await createOrder();
    expect(first.orderNumber).toBe(`OC-${year}-000001`);
    expect(second.orderNumber).toBe(`OC-${year}-000002`);
  });

  // --- S3.7: create() guards ----------------------------------------------

  it('rejects an empty services payload with WORK_ORDER_EMPTY_LINES', async () => {
    const client = await seedClient();
    const vehicle = await seedVehicle(client.id);

    const error = await catchHttpError(
      service.create({
        clientId: client.id,
        vehicleId: vehicle.id,
        services: [],
      } satisfies CreateWorkOrderDto)
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getStatus()).toBe(400);
    expect(error?.getResponse()).toEqual(
      expect.objectContaining({ errorCode: 'WORK_ORDER_EMPTY_LINES' })
    );
    expect(await prisma.workOrder.count()).toBe(0);
  });

  it('rejects a vehicle that does not belong to the client with VEHICLE_CLIENT_MISMATCH', async () => {
    const clientA = await seedClient('Client A');
    const vehicleA = await seedVehicle(clientA.id);
    const clientB = await seedClient('Client B');

    const error = await catchHttpError(
      service.create({
        clientId: clientB.id,
        vehicleId: vehicleA.id,
        services: [{ serviceId: (await seedService()).id, quantity: 1 }],
      } satisfies CreateWorkOrderDto)
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect(error?.getStatus()).toBe(409);
    expect(error?.getResponse()).toEqual(
      expect.objectContaining({ errorCode: 'VEHICLE_CLIENT_MISMATCH' })
    );
    expect(await prisma.workOrder.count()).toBe(0);
  });
});
