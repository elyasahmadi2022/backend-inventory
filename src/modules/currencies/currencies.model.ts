import { prisma } from "../../db/prisma.js";
import { withTransaction } from "../../db/transaction.js";
import { AppError } from "../../utils/app-error.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type {
  CreateCurrencyInput,
  CreateExchangeRateInput,
  ConversionRateQuery,
  ListExchangeRatesQuery,
  UpdateCurrencyInput
} from "./currencies.validation.js";

type CurrencyCode = "AFN" | "USD" | "PKR";

async function latestRate(fromCurrency: CurrencyCode, toCurrency: CurrencyCode, effectiveAt: Date) {
  const direct = await prisma.exchangeRate.findFirst({
    where: { fromCurrency, toCurrency, effectiveAt: { lte: effectiveAt } },
    orderBy: { effectiveAt: "desc" }
  });
  if (direct) return Number(direct.rate);

  const inverse = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: toCurrency, toCurrency: fromCurrency, effectiveAt: { lte: effectiveAt } },
    orderBy: { effectiveAt: "desc" }
  });
  return inverse ? 1 / Number(inverse.rate) : null;
}

export async function resolveConversionRate(input: ConversionRateQuery) {
  if (input.fromCurrency === input.toCurrency) {
    return { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rate: 1, path: [input.fromCurrency] };
  }

  const effectiveAt = input.effectiveAt ?? new Date();
  const directRate = await latestRate(input.fromCurrency, input.toCurrency, effectiveAt);
  if (directRate) {
    return { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rate: directRate, path: [input.fromCurrency, input.toCurrency] };
  }

  const base = await prisma.currency.findFirst({ where: { isBase: true, isActive: true } });
  if (base && base.code !== input.fromCurrency && base.code !== input.toCurrency) {
    const [toBase, fromBase] = await Promise.all([
      latestRate(input.fromCurrency, base.code, effectiveAt),
      latestRate(base.code, input.toCurrency, effectiveAt)
    ]);
    if (toBase && fromBase) {
      return { fromCurrency: input.fromCurrency, toCurrency: input.toCurrency, rate: toBase * fromBase, path: [input.fromCurrency, base.code, input.toCurrency] };
    }
  }

  throw new AppError(400, `No exchange rate is configured from ${input.fromCurrency} to ${input.toCurrency}`);
}

export async function listCurrencies() {
  const currencies = await prisma.currency.findMany({
    orderBy: { code: "asc" }
  });

  return { currencies };
}

export async function createCurrency(input: CreateCurrencyInput) {
  const currency = await withTransaction(async (tx) => {
    if (input.isBase) {
      await tx.currency.updateMany({
        where: { code: { not: input.code } },
        data: { isBase: false }
      });
    }

    try {
      return await tx.currency.create({
        data: input
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        throw new AppError(409, "Currency already exists");
      }
      throw error;
    }
  });

  return { currency };
}

export async function updateCurrency(
  code: "AFN" | "USD" | "PKR",
  input: UpdateCurrencyInput
) {
  const currency = await withTransaction(async (tx) => {
    const current = await tx.currency.findUnique({ where: { code } });
    if (!current) throw new AppError(404, "Currency not found");
    if (current.isBase && (input.isBase === false || input.isActive === false)) {
      throw new AppError(400, "Choose another active base currency before disabling the current base currency");
    }
    if (input.isBase) {
      await tx.currency.updateMany({
        where: { code: { not: code } },
        data: { isBase: false }
      });
    }

    return tx.currency.update({
      where: { code },
      data: input
    });
  });

  return { currency };
}

export async function deleteCurrency(code: "AFN" | "USD" | "PKR") {
  const currency = await prisma.currency.findUnique({ where: { code } });
  if (!currency) {
    throw new AppError(404, "Currency not found");
  }
  if (currency.isBase) {
    throw new AppError(400, "Base currency cannot be deleted");
  }

  const updated = await prisma.currency.update({
    where: { code },
    data: { isActive: false }
  });

  return { currency: updated };
}

export async function listExchangeRates(query: ListExchangeRatesQuery) {
  const pagination = getPagination(query);
  const where = {
    fromCurrency: query.fromCurrency,
    toCurrency: query.toCurrency
  };
  const [exchangeRates, total] = await Promise.all([
    prisma.exchangeRate.findMany({
      where,
      orderBy: { effectiveAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        createdBy: {
          select: { id: true, fullName: true, username: true }
        }
      }
    }),
    prisma.exchangeRate.count({ where })
  ]);

  return paginatedResponse(
    exchangeRates,
    total,
    pagination.page,
    pagination.limit
  );
}

export async function createExchangeRate(
  input: CreateExchangeRateInput,
  createdById?: string
) {
  const [fromCurrency, toCurrency] = await Promise.all([
    prisma.currency.findUnique({ where: { code: input.fromCurrency } }),
    prisma.currency.findUnique({ where: { code: input.toCurrency } })
  ]);

  if (!fromCurrency || !toCurrency) {
    throw new AppError(400, "Currency does not exist");
  }

  const exchangeRate = await prisma.exchangeRate.create({
    data: {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: input.rate,
      effectiveAt: input.effectiveAt,
      createdById
    }
  });

  return { exchangeRate };
}
