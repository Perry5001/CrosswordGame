FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-requirements requirements.txt

COPY src/ ./src/

EXPOSE 8080

CMD ["gunicorn", "src.app:app", "--bind", "0.0.0.0:8080", "--workers", "2"]