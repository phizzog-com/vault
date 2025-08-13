FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create models directory for caching
RUN mkdir -p /app/models

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV MODEL_CACHE_DIR=/app/models

# Expose MCP HTTP port
EXPOSE 8100

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:8100/health || exit 1

# Run the server
CMD ["python", "server.py"]