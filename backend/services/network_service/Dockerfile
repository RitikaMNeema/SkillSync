FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/network_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/network_service/ ./services/network_service/

WORKDIR /app/services/network_service
EXPOSE 3009
CMD ["uvicorn", "network_service:app", "--host", "0.0.0.0", "--port", "3009"]
