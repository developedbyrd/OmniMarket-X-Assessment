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

# Run Uvicorn pointing to the main file
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
