import { prisma } from "../../db/prisma.js";
import { getPagination, paginatedResponse } from "../../utils/pagination.js";
import type { ListOperationsQuery } from "./operations.validation.js";

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextDay(date: Date) {
  const value = startOfDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

export async function listOperations(query: ListOperationsQuery) {
  const pagination = getPagination(query);
  const dateRange = {
    gte: query.from ? startOfDay(query.from) : undefined,
    lt: query.to ? nextDay(query.to) : undefined
  };
  const includePayments = !query.kind || query.kind === "payment";
  const includeTransfers = !query.kind || query.kind === "transfer";
  const fetchLimit = pagination.skip + pagination.take;

  const [payments, transfers, paymentCount, transferCount] = await Promise.all([
    includePayments ? prisma.payment.findMany({
      where: { paymentDate: dateRange },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: fetchLimit,
      include: {
        partner: { select: { id: true, code: true, name: true } },
        salesInvoice: { select: { id: true, number: true } },
        purchaseBill: { select: { id: true, number: true } },
        fromAccount: { select: { id: true, code: true, name: true } },
        toAccount: { select: { id: true, code: true, name: true } }
      }
    }) : [],
    includeTransfers ? prisma.moneyTransfer.findMany({
      where: { transferDate: dateRange, status: "posted" },
      orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
      take: fetchLimit,
      include: {
        fromAccount: { select: { id: true, code: true, name: true } },
        toAccount: { select: { id: true, code: true, name: true } }
      }
    }) : [],
    includePayments ? prisma.payment.count({ where: { paymentDate: dateRange } }) : 0,
    includeTransfers ? prisma.moneyTransfer.count({ where: { transferDate: dateRange, status: "posted" } }) : 0
  ]);

  const rows = [
    ...payments.map((payment) => ({
      id: payment.id,
      number: payment.number,
      kind: payment.salesInvoiceId
        ? (payment.direction === "receive" ? "customer_receipt" : "customer_refund")
        : payment.purchaseBillId
          ? (payment.direction === "pay" ? "vendor_payment" : "vendor_refund")
          : "expense",
      direction: payment.direction,
      date: payment.paymentDate,
      currencyCode: payment.currencyCode,
      amount: payment.amount,
      fromAccount: payment.fromAccount,
      toAccount: payment.toAccount,
      partner: payment.partner,
      documentNumber: payment.salesInvoice?.number ?? payment.purchaseBill?.number ?? null,
      notes: payment.notes
    })),
    ...transfers.map((transfer) => ({
      id: transfer.id,
      number: transfer.number,
      kind: "internal_transfer",
      direction: "transfer",
      date: transfer.transferDate,
      currencyCode: transfer.currencyCode,
      amount: transfer.amount,
      fromAccount: transfer.fromAccount,
      toAccount: transfer.toAccount,
      partner: null,
      documentNumber: null,
      notes: transfer.notes
    }))
  ].sort((left, right) => right.date.getTime() - left.date.getTime());

  return paginatedResponse(
    rows.slice(pagination.skip, pagination.skip + pagination.take),
    paymentCount + transferCount,
    pagination.page,
    pagination.limit
  );
}
