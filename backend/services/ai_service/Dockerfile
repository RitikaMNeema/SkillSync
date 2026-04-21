FROM python:3.11-slim

WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/ai_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ai_service/ ./services/ai_service/

WORKDIR /app/services/ai_service

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3010"]