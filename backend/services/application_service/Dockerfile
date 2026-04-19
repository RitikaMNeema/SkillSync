FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/application_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/application_service/ ./services/application_service/

WORKDIR /app/services/application_service
EXPOSE 3006
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3006"]
