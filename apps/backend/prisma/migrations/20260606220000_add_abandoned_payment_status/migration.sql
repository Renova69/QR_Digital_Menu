-- Add ABANDONED value to PaymentStatus enum for sessions that expire without payment.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'ABANDONED';
