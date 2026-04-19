FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/messaging_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/messaging_service/ ./services/messaging_service/

WORKDIR /app/services/messaging_service
EXPOSE 3007
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3007"]
