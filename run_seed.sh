#!/bin/bash
# Seed the OmniMarket database
# Run this from the FastAPI service shell in Render

set -e

echo "=========================================="
echo "OmniMarket Database Seeder"
echo "=========================================="
echo ""
echo "Starting database seeding..."
echo "Time: $(date)"
echo ""

cd /app

# Run the seeder
python seed_db.py

echo ""
echo "=========================================="
echo "Seeding completed successfully!"
echo "Time: $(date)"
echo "=========================================="
