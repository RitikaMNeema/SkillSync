FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/job_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/job_service/ ./services/job_service/

WORKDIR /app/services/job_service
EXPOSE 3005
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3005"]
