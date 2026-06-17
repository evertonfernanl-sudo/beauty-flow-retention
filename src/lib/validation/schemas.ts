import { z } from "zod";

// Brazilian phone: 10 or 11 digits, optional country code +55
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 13, {
    message: "Telefone inválido (use DDD + número)",
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "E-mail inválido" })
  .max(255);

export const nameSchema = z
  .string()
  .trim()
  .min(2, { message: "Nome muito curto" })
  .max(120, { message: "Nome muito longo" });

export const passwordSchema = z
  .string()
  .min(8, { message: "Mínimo 8 caracteres" })
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "Use letras e números",
  });

export const moneySchema = z
  .number({ invalid_type_error: "Valor inválido" })
  .nonnegative({ message: "Valor não pode ser negativo" })
  .max(9_999_999);

export const dateISOSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Data inválida" });

export const clientFormSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.optional().or(z.literal("")),
  email: emailSchema.optional().or(z.literal("")),
  birthday: dateISOSchema.optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const appointmentFormSchema = z.object({
  client_id: z.string().uuid({ message: "Cliente inválido" }),
  service_id: z.string().uuid({ message: "Serviço inválido" }),
  start_datetime: dateISOSchema,
  price: moneySchema.optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const serviceFormSchema = z.object({
  name: nameSchema,
  price: moneySchema,
  duration_minutes: z.number().int().min(5).max(720),
  return_days: z.number().int().min(1).max(365).optional(),
});

export const transactionFormSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  amount: moneySchema,
  transaction_date: dateISOSchema,
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;
export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>;
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;
export type TransactionFormInput = z.infer<typeof transactionFormSchema>;
