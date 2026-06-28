-- Alter business_vertical ENUM to add SERVICE and FINANCE
ALTER TYPE public.business_vertical ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE public.business_vertical ADD VALUE IF NOT EXISTS 'FINANCE';
