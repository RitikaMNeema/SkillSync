FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app

COPY shared/ ./shared/
COPY services/recruiter_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/recruiter_service/ ./services/recruiter_service/

WORKDIR /app/services/recruiter_service
EXPOSE 3003
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3003"]
