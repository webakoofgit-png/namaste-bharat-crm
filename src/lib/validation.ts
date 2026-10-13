import { z } from "zod";
const profile = {
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  password: z.string().min(10, "Password must have at least 10 characters").max(100),
  city: z.string().trim().min(1, "Enter your city").max(100),
  pinCode: z.string().regex(/^\d{6}$/, "PIN code must have six digits"),
  address: z.string().trim().min(1, "Enter your address").max(500),
};
export const customerRegistration = z.object(profile);
export const vendorRegistration = customerRegistration.extend({
  businessName: z.string().trim().min(2, "Enter your business name").max(190),
  category: z.string().trim().min(2, "Enter your business category").max(100),
  whatsapp: z
    .string()
    .regex(/^[6-9]\d{9}$|^$/, "Enter a valid WhatsApp number")
    .optional(),
});
export const loginValidation = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(100),
});
