FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose FastAPI port
EXPOSE 8001

# Command runs the API and allows the consumer to be started via script or supervisor if needed
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
