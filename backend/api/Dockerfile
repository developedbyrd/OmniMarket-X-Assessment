FROM python:3.11-slim

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
# Enable venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Optional one-time seed on startup, then run Uvicorn.
# Set SEED_ON_STARTUP=true in Render to auto-populate the database.
CMD ["sh", "-c", "if [ \"${SEED_ON_STARTUP:-false}\" = \"true\" ]; then python init_db.py && python seed_db.py; fi && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
