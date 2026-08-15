import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import { nextEntityCode, partnerCodeKey } from "../../utils/code-generator.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreatePartnerInput,
  CreatePartnerLedgerAccountInput,
  ListPartnersQuery,
  UpdatePartnerInput
} from "./partners.validation.js";

const partnerInclude = {
  receivableAccount: {
    select: { id: true, code: true, name: true }
  },
  payableAccount: {
    select: { id: true, code: true, name: true }
  },
  ledgerAccounts: {
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true }
      },
      currency: true
    },
    orderBy: [{ type: "asc" }, { currencyCode: "asc" }]
  }
} satisfies Prisma.PartnerInclude;

function canHaveReceivable(type: string) {
  return ["customer", "both", "sarafi", "staff"].includes(type);
}

function canHavePayable(type: string) {
  return ["vendor", "both", "sarafi", "staff"].includes(type);
}

async function resolveControlAccountId(
  tx: Prisma.TransactionClient,
  accountId: string | undefined,
  type: "accounts_receivable" | "accounts_payable"
) {
  if (accountId) return accountId;

  const account = await tx.account.findFirst({
    where: { type, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true }
  });

  if (!account) {
    throw new AppError(
      400,
      `No active ${type.replaceAll("_", " ")} control account is configured`
    );
  }

  return account.id;
}

function mapUniqueError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(409, "Partner or ledger account already exists");
  }

  throw error;
}

export async function listPartners(query: ListPartnersQuery) {
  const pagination = getPagination(query);
  const where = {
    type: query.type,
    isActive: query.isActive
  };
  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: partnerInclude
    }),
    prisma.partner.count({ where })
  ]);

  return paginatedResponse(partners, total, pagination.page, pagination.limit);
}

export async function getPartner(partnerId: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: partnerInclude
  });

  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return { partner };
}

export async function getPartnerByCode(code: string) {
  const partner = await prisma.partner.findUnique({
    where: { code },
    include: partnerInclude
  });

  if (!partner) {
    throw new AppError(404, "Partner not found");
  }

  return { partner };
}

export async function createPartner(input: CreatePartnerInput) {
  try {
    const partner = await withTransaction(async (tx) => {
      const code =
        input.code ?? (await nextEntityCode(tx, partnerCodeKey(input.type)));
      const receivableAccountId = canHaveReceivable(input.type)
        ? await resolveControlAccountId(
            tx,
            input.receivableAccountId,
            "accounts_receivable"
          )
        : undefined;
      const payableAccountId = canHavePayable(input.type)
        ? await resolveControlAccountId(
            tx,
            input.payableAccountId,
            "accounts_payable"
          )
        : undefined;
      const createdPartner = await tx.partner.create({
        data: {
          code,
          name: input.name,
          type: input.type,
          phone: input.phone,
          address: input.address,
          receivableAccountId,
          payableAccountId,
          isActive: input.isActive
        }
      });

      const ledgerRows = input.ledgerCurrencies.flatMap((currencyCode) => {
        const rows = [];

        if (canHaveReceivable(input.type) && receivableAccountId) {
          rows.push({
            partnerId: createdPartner.id,
            accountId: receivableAccountId,
            currencyCode,
            type: "receivable" as const,
            isDefault: currencyCode === input.ledgerCurrencies[0]
          });
        }

        if (canHavePayable(input.type) && payableAccountId) {
          rows.push({
            partnerId: createdPartner.id,
            accountId: payableAccountId,
            currencyCode,
            type: "payable" as const,
            isDefault: currencyCode === input.ledgerCurrencies[0]
          });
        }

        return rows;
      });

      if (ledgerRows.length > 0) {
        await tx.partnerLedgerAccount.createMany({ data: ledgerRows });
      }

      return tx.partner.findUniqueOrThrow({
        where: { id: createdPartner.id },
        include: partnerInclude
      });
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function updatePartner(partnerId: string, input: UpdatePartnerInput) {
  try {
    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: input,
      include: partnerInclude
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function deletePartner(partnerId: string) {
  try {
    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: { isActive: false },
      include: partnerInclude
    });

    return { partner };
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function createPartnerLedgerAccount(
  partnerId: string,
  input: CreatePartnerLedgerAccountInput
) {
  try {
    const ledgerAccount = await prisma.partnerLedgerAccount.create({
      data: {
        partnerId,
        accountId: input.accountId,
        currencyCode: input.currencyCode,
        type: input.type,
        isDefault: input.isDefault
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true }
        },
        currency: true
      }
    });

    return { ledgerAccount };
  } catch (error) {
    mapUniqueError(error);
  }
}
