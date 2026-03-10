FROM python:3.10

WORKDIR /app

# Install required system libraries for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 7860

CMD ["uvicorn", "face_server:app", "--host", "0.0.0.0", "--port", "7860"]