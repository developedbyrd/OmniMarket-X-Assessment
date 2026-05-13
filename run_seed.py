#!/usr/bin/env python3
"""
OmniMarket Database Seeder Runner
Run this from the FastAPI Render service shell
"""
import subprocess
import sys
from datetime import datetime

def run_seed():
    print("=" * 50)
    print("OmniMarket Database Seeder")
    print("=" * 50)
    print("")
    print(f"Starting database seeding at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("")
    
    try:
        # Run the actual seeder
        result = subprocess.run(
            [sys.executable, "seed_db.py"],
            cwd="/app",
            capture_output=False,
            text=True
        )
        
        print("")
        print("=" * 50)
        if result.returncode == 0:
            print("✓ Seeding completed successfully!")
        else:
            print("✗ Seeding failed with exit code:", result.returncode)
            sys.exit(result.returncode)
        print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)
    except Exception as e:
        print(f"Error running seeder: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_seed()
