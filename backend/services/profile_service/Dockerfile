FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/profile_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/profile_service/ ./services/profile_service/

WORKDIR /app/services/profile_service
EXPOSE 3002
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
