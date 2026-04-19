FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/analytics_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/analytics_service/ ./services/analytics_service/

WORKDIR /app/services/analytics_service
EXPOSE 3008
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3008"]
