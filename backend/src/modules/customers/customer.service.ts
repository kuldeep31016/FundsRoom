import { withTransaction } from '../../db/pool';
import { ApiError } from '../../utils/api-error';
import type { CustomerRecord, FollowUpRecord } from '../../types/domain';
import * as repository from './customer.repository';
import type {
  CreateCustomerInput,
  CreateFollowUpInput,
  CustomerListQuery,
  UpdateCustomerInput,
} from './customer.schema';

export async function list(
  params: CustomerListQuery,
): Promise<{ rows: CustomerRecord[]; total: number }> {
  return repository.listCustomers(params);
}

export async function getById(id: string): Promise<CustomerRecord> {
  const customer = await repository.findCustomerById(id);
  if (!customer) {
    throw ApiError.notFound('Customer');
  }
  return customer;
}

export async function create(
  input: CreateCustomerInput,
  createdBy: string,
): Promise<CustomerRecord> {
  return repository.insertCustomer(
    {
      name: input.name,
      mobile: input.mobile,
      email: input.email ?? null,
      businessName: input.businessName ?? null,
      gstNumber: input.gstNumber ?? null,
      customerType: input.customerType,
      address: input.address ?? null,
      status: input.status,
      followUpDate: input.followUpDate ?? null,
      notes: input.notes ?? null,
    },
    createdBy,
  );
}

export async function update(id: string, input: UpdateCustomerInput): Promise<CustomerRecord> {
  // Confirm existence first so a missing customer is a clean 404 rather than a
  // no-op 200 from an UPDATE that matched zero rows.
  await getById(id);

  // `undefined` means "not supplied"; `null` means "clear the column".
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) patch[key] = value;
  }

  const updated = await repository.updateCustomer(id, patch);
  if (!updated) {
    throw ApiError.notFound('Customer');
  }
  return updated;
}

/**
 * Add a CRM follow-up note.
 *
 * When the note carries a next-contact date, the customer's `follow_up_date` is
 * advanced in the same transaction so the list view and the activity log can
 * never disagree.
 */
export async function addFollowUp(
  customerId: string,
  input: CreateFollowUpInput,
  createdBy: string,
): Promise<{ followUp: FollowUpRecord; customer: CustomerRecord }> {
  await getById(customerId);

  return withTransaction(async (client) => {
    const followUp = await repository.insertFollowUp(
      customerId,
      input.note,
      input.followUpDate ?? null,
      createdBy,
      client,
    );

    let customer = await repository.findCustomerById(customerId, client);
    if (input.followUpDate) {
      customer = await repository.updateCustomer(
        customerId,
        { followUpDate: input.followUpDate },
        client,
      );
    }

    if (!customer) {
      throw ApiError.notFound('Customer');
    }
    return { followUp, customer };
  });
}

export async function listFollowUps(
  customerId: string,
  pagination: { page: number; limit: number },
): Promise<{ rows: FollowUpRecord[]; total: number }> {
  await getById(customerId);
  return repository.listFollowUps(customerId, pagination);
}
