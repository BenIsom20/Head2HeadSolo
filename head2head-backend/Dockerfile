FROM python:3.10-slim

# Prevent .pyc files and enable output flushing
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . ./

# Expose Flask port
EXPOSE 5000

# Launch Flask
CMD ["flask", "run", "--host=0.0.0.0"]