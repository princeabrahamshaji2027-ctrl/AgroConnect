-- AgroConnect Database Check Constraints for Validation System

-- Normalize existing seed data file paths to PDF format
UPDATE public.expert_applications 
SET cv_file_path = regexp_replace(cv_file_path, '\.(jpeg|jpg|png|doc|docx)$', '.pdf', 'i')
WHERE cv_file_path !~* '\.pdf$';

-- 1. Product price must be greater than zero
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_price_positive_check'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_price_positive_check CHECK (price > 0);
    END IF;
END $$;

-- 2. Product stock must be non-negative
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonnegative_check'
    ) THEN
        ALTER TABLE public.products ADD CONSTRAINT products_stock_nonnegative_check CHECK (stock >= 0);
    END IF;
END $$;

-- 3. Expert application CV file path must end with .pdf (case insensitive)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'expert_applications_cv_pdf_check'
    ) THEN
        ALTER TABLE public.expert_applications ADD CONSTRAINT expert_applications_cv_pdf_check CHECK (cv_file_path ~* '\.pdf$');
    END IF;
END $$;
