FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/connection_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/connection_service/ ./services/connection_service/

WORKDIR /app/services/connection_service
EXPOSE 3004
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3004"]
