FROM python:3.12-alpine

RUN apk add --no-cache tzdata

WORKDIR /app
COPY telemetry /app/telemetry

EXPOSE 80
CMD ["python3", "-u", "/app/telemetry/server.py"]
