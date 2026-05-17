-- Migration: add image_url to categories
ALTER TABLE "categories" ADD COLUMN "image_url" TEXT;
